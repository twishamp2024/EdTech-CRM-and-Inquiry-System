// End-to-end persistence tests: the real Express app, inquiry service,
// Sequelize models and `pg` driver, talking over TCP to an isolated in-memory
// PostgreSQL (PGlite) that has schema.sql applied. No external database or
// credentials are involved.
//
// Note: PGlite runs a single backend, so concurrent requests are serialised by
// its socket server; the advisory-lock path is exercised for real only by
// tests/integration against a full PostgreSQL server.

import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/config/database.js';
import { BACKEND_ROOT, loadConfig } from '../../src/config/env.js';
import { createInquiryService } from '../../src/services/inquiry.service.js';
import { silentLogger } from '../../src/utils/logger.js';
import { buildAuthKit, TEST_ENV } from '../helpers/testApp.js';

const schemaSql = fs.readFileSync(path.join(BACKEND_ROOT, '..', 'schema.sql'), 'utf8');

let pglite;
let socketServer;
let db;
let app;

function buildApp(database, envOverrides = {}) {
  const config = loadConfig({ ...TEST_ENV, INQUIRY_RATE_LIMIT_MAX: '1000', ...envOverrides });
  const inquiryService = createInquiryService({
    sequelize: database.sequelize,
    Inquiry: database.models.Inquiry,
    duplicateWindowMs: config.inquiries.duplicateWindowMs,
  });
  return createApp({
    config,
    logger: silentLogger,
    checkDatabase: () => database.checkConnection(),
    services: { inquiryService, authService: buildAuthKit(config).authService },
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(schemaSql);
  socketServer = new PGLiteSocketServer({ db: pglite, port: 0, maxConnections: 4 });
  await socketServer.start();

  db = createDatabase({
    url: `postgresql://postgres:postgres@${socketServer.getServerConn()}/postgres`,
    sslMode: 'disable',
    poolMax: 3,
    connectRetries: 0,
  });
  await db.connectWithRetry({ retries: 0 });
  app = buildApp(db);
});

afterAll(async () => {
  await db?.close();
  await socketServer?.stop();
  await pglite?.close();
});

beforeEach(async () => {
  await pglite.exec('DELETE FROM public.inquiries');
});

const body = (overrides = {}) => ({
  name: '  Ravi  Kumar ',
  email: ' Ravi.Kumar@Example.org ',
  phone: '+1 (555) 010-0000',
  userType: 'Student',
  category: 'Scholarship',
  message: 'Is the merit scholarship open to international students?',
  ...overrides,
});

const rows = async () =>
  (await pglite.query('SELECT * FROM public.inquiries ORDER BY created_at')).rows;

describe('POST /api/inquiries persists to PostgreSQL', () => {
  it('stores a valid inquiry with status New and timestamps, and returns its id', async () => {
    const before = Date.now();
    const res = await request(app).post('/api/inquiries').send(body());
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { duplicate: false } });

    const stored = await rows();
    expect(stored).toHaveLength(1);
    const [row] = stored;
    expect(row).toMatchObject({
      id: res.body.data.id,
      name: 'Ravi Kumar',
      email: 'ravi.kumar@example.org',
      phone: '+1 (555) 010-0000',
      user_type: 'Student',
      category: 'Scholarship',
      message: 'Is the merit scholarship open to international students?',
      status: 'New',
    });
    expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.created_at.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(row.updated_at.getTime()).toBe(row.created_at.getTime());
  });

  it('writes nothing for an invalid request', async () => {
    const res = await request(app)
      .post('/api/inquiries')
      .send(body({ status: 'Resolved' }));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it('returns the existing id for an identical submission within the duplicate window', async () => {
    const first = await request(app).post('/api/inquiries').send(body());
    const second = await request(app)
      .post('/api/inquiries')
      .send(body({ name: 'Ravi Kumar' }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ id: first.body.data.id, duplicate: true });
    expect(await rows()).toHaveLength(1);
  });

  it('stores one row when identical submissions arrive at the same time', async () => {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () => request(app).post('/api/inquiries').send(body())),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.data.id)).size).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it('treats a changed message as a new inquiry', async () => {
    await request(app).post('/api/inquiries').send(body());
    const res = await request(app)
      .post('/api/inquiries')
      .send(body({ message: 'A different question about the deadline, please.' }));

    expect(res.status).toBe(201);
    expect(await rows()).toHaveLength(2);
  });

  it('accepts the same inquiry again once the duplicate window has passed', async () => {
    await request(app).post('/api/inquiries').send(body());
    await pglite.exec("UPDATE public.inquiries SET created_at = now() - interval '1 hour'");

    const res = await request(app).post('/api/inquiries').send(body());
    expect(res.status).toBe(201);
    expect(await rows()).toHaveLength(2);
  });

  it('always creates new rows when duplicate detection is disabled', async () => {
    const noDedupe = buildApp(db, { INQUIRY_DUPLICATE_WINDOW_MINUTES: '0' });
    await request(noDedupe).post('/api/inquiries').send(body());
    const res = await request(noDedupe).post('/api/inquiries').send(body());

    expect(res.status).toBe(201);
    expect(await rows()).toHaveLength(2);
  });
});

describe('POST /api/inquiries when the database is unreachable', () => {
  it('returns 503 and never reports success', async () => {
    const unreachable = createDatabase({
      url: 'postgresql://postgres:s3cret-pw@127.0.0.1:1/postgres',
      sslMode: 'disable',
      poolMax: 1,
      connectRetries: 0,
    });
    try {
      const res = await request(buildApp(unreachable)).post('/api/inquiries').send(body());

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'The service is temporarily unavailable. Please try again shortly.',
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/s3cret|127\.0\.0\.1|ECONNREFUSED/);
    } finally {
      await unreachable.close();
    }
  });
});
