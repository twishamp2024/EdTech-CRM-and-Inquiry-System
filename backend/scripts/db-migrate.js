#!/usr/bin/env node
// Applies ../schema.sql (the reproducible initial schema) to DATABASE_URL.
// schema.sql is idempotent and wrapped in a transaction, so re-running is safe
// and a failure leaves the database unchanged.
//
// Usage (from backend/):  npm run db:migrate

import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKEND_ROOT } from '../src/config/env.js';
import { withDatabase } from './lib/withDatabase.js';

const SCHEMA_PATH = path.resolve(BACKEND_ROOT, '..', 'schema.sql');

await withDatabase(async ({ db, logger }) => {
  const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
  logger.info(`Applying ${path.relative(process.cwd(), SCHEMA_PATH)}`);
  await db.sequelize.query(sql, { raw: true });
  logger.info('Schema applied successfully. Run `npm run db:check` to verify it.');
});
