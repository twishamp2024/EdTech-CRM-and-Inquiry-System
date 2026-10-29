#!/usr/bin/env node
// Connects to DATABASE_URL and verifies that the tables created by schema.sql
// match the Sequelize models and that Row Level Security is enabled.
// Read-only: makes no changes.
//
// Usage (from backend/):  npm run db:check

import { QueryTypes } from 'sequelize';
import { COLUMNS_QUERY, compareModelsToColumns } from '../src/models/schemaComparison.js';
import { withDatabase } from './lib/withDatabase.js';

await withDatabase(async ({ db, logger }) => {
  const query = (sql) => db.sequelize.query(sql, { type: QueryTypes.SELECT });

  const [{ version }] = await query('SELECT version()');
  logger.info('Connected', { server: version.split(',')[0] });

  const problems = compareModelsToColumns(db.models, await query(COLUMNS_QUERY));

  const rls = await query(`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname IN ('admins', 'inquiries')
  `);
  for (const { relname, relrowsecurity } of rls) {
    if (!relrowsecurity) problems.push(`${relname}: Row Level Security is not enabled`);
  }

  if (problems.length) {
    for (const problem of problems) logger.error(problem);
    throw Object.assign(new Error(`Schema check failed with ${problems.length} problem(s)`), {
      expected: true,
    });
  }

  const [{ admins, inquiries }] = await query(
    'SELECT (SELECT count(*) FROM public.admins)::int AS admins, (SELECT count(*) FROM public.inquiries)::int AS inquiries',
  );
  logger.info('Schema matches the models and RLS is enabled', { admins, inquiries });
});
