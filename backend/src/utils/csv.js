// Lets Excel detect UTF-8 (names such as Zoë or 李小龙 stay intact).
export const UTF8_BOM = String.fromCodePoint(0xfeff);

// Characters that make spreadsheet applications treat a cell as a formula
// (OWASP "CSV Injection"): = + - @ and leading tab / carriage return.
const FORMULA_START = /^[=+\-@\t\r]/;
const FORMULA_AFTER_SPACE = /^\s+[=+\-@]/;

/**
 * Prefixes a single quote when a value would start a formula, so Excel,
 * LibreOffice and Google Sheets show it as text instead of evaluating it.
 * The quote is hidden in those apps; the original text is still visible.
 */
export function neutralizeFormula(text) {
  return FORMULA_START.test(text) || FORMULA_AFTER_SPACE.test(text) ? `'${text}` : text;
}

/**
 * One RFC 4180 field. Every field is quoted and embedded quotes are doubled,
 * so commas, quotes and line breaks inside values are always safe. Strings
 * are formula-neutralised; dates become ISO 8601 (UTC); null/undefined → "".
 */
export function csvField(value) {
  if (value === null || value === undefined) return '""';
  let text;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  else if (typeof value === 'string') text = neutralizeFormula(value);
  else text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Builds a CSV document: UTF-8 byte-order mark (so Excel detects UTF-8),
 * a header row, CRLF line endings (RFC 4180), trailing newline.
 *
 * @param {{ header: string, value: (row: object) => unknown }[]} columns
 * @param {object[]} rows
 */
export function toCsv(columns, rows) {
  const lines = [
    columns.map((column) => csvField(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => csvField(column.value(row))).join(',')),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
