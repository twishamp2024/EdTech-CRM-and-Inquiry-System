/**
 * SQL that lists the columns of the tables our models map to. Works on any
 * PostgreSQL (Supabase, local, PGlite) via information_schema.
 */
export const COLUMNS_QUERY = `
  SELECT table_name, column_name, is_nullable, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('admins', 'inquiries')
  ORDER BY table_name, ordinal_position
`;

/**
 * Compares Sequelize model definitions with the live table columns and returns
 * a list of human-readable mismatches (empty when they agree).
 *
 * @param {Record<string, import('sequelize').ModelStatic<any>>} models
 * @param {{ table_name: string, column_name: string, is_nullable: string }[]} columnRows
 */
export function compareModelsToColumns(models, columnRows) {
  const problems = [];

  for (const model of Object.values(models)) {
    const table = model.getTableName();
    const columns = new Map(
      columnRows.filter((row) => row.table_name === table).map((row) => [row.column_name, row]),
    );

    if (columns.size === 0) {
      problems.push(`table "${table}" does not exist (run npm run db:migrate)`);
      continue;
    }

    const mappedFields = new Set();
    for (const [attribute, definition] of Object.entries(model.getAttributes())) {
      const field = definition.field ?? attribute;
      mappedFields.add(field);
      const column = columns.get(field);
      if (!column) {
        problems.push(`${table}: model attribute "${attribute}" maps to missing column "${field}"`);
        continue;
      }
      const columnRequired = column.is_nullable === 'NO';
      const modelRequired = definition.allowNull === false || definition.primaryKey === true;
      if (columnRequired !== modelRequired) {
        problems.push(
          `${table}.${field}: column is ${columnRequired ? 'NOT NULL' : 'nullable'} but model "${attribute}" is ${modelRequired ? 'required' : 'optional'}`,
        );
      }
    }

    for (const field of columns.keys()) {
      if (!mappedFields.has(field)) {
        problems.push(`${table}: column "${field}" is not mapped by model ${model.name}`);
      }
    }
  }

  return problems;
}
