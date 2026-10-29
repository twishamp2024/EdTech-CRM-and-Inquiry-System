// Runs against a real PostgreSQL database (e.g. a Supabase test project).
// Skipped unless TEST_DATABASE_URL is set. It applies schema.sql (idempotent)
// and performs every write inside a transaction that is rolled back.
//
//   TEST_DATABASE_URL=postgresql://... npm run test:integration

import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/config/database.js';
import { BACKEND_ROOT, loadDatabaseConfig, loadDotenv } from '../../src/config/env.js';
import { COLUMNS_QUERY, compareModelsToColumns } from '../../src/models/schemaComparison.js';
import { silentLogger } from '../../src/utils/logger.js';

loadDotenv();
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('database integration (TEST_DATABASE_URL)', () => {
  let db;

  beforeAll(async () => {
    const config = loadDatabaseConfig({ ...process.env, DATABASE_URL: TEST_DATABASE_URL });
    db = createDatabase(config.database, { logger: silentLogger });
    await db.connectWithRetry({ retries: 0 });
    await db.sequelize.query(fs.readFileSync(path.join(BACKEND_ROOT, '..', 'schema.sql'), 'utf8'));
  });

  afterAll(async () => {
    await db?.close();
  });

  it('answers health checks', async () => {
    await expect(db.checkConnection()).resolves.toBeUndefined();
  });

  it('has tables matching the models', async () => {
    const rows = await db.sequelize.query(COLUMNS_QUERY, { type: QueryTypes.SELECT });
    expect(compareModelsToColumns(db.models, rows)).toEqual([]);
  });

  it('round-trips an inquiry and an admin through the models', async () => {
    const transaction = await db.sequelize.transaction();
    try {
      const inquiry = await db.models.Inquiry.create(
        {
          name: 'Integration Test',
          email: 'integration@example.com',
          phone: '+1 (555) 010-0000',
          userType: 'Student',
          category: 'Scholarship',
          message: 'Created by the integration test suite and rolled back.',
        },
        { transaction },
      );
      const reloaded = await db.models.Inquiry.findByPk(inquiry.id, { transaction });
      expect(reloaded).toMatchObject({
        status: 'New',
        userType: 'Student',
        phone: '+1 (555) 010-0000',
      });

      const admin = await db.models.Admin.create(
        {
          email: 'Integration-Admin@Example.com',
          passwordHash: await bcrypt.hash('integration-pass', 4),
        },
        { transaction },
      );
      const found = await db.models.Admin.findByPk(admin.id, { transaction });
      expect(found.email).toBe('integration-admin@example.com');
      expect(found.passwordHash).toBeUndefined();
    } finally {
      await transaction.rollback();
    }
  });

  it('rejects disallowed values at the database level', async () => {
    await expect(
      db.sequelize.query(
        "INSERT INTO public.inquiries (name, email, phone, user_type, category, message) VALUES ('Xy', 'x@example.com', '5550100000', 'Teacher', 'Admission', 'hi')",
      ),
    ).rejects.toMatchObject({ original: { code: '23514' } });
  });
});
