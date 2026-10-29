import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSequelizeOptions,
  buildSslOptions,
  createDatabase,
  describeDatabaseError,
  describeTarget,
} from '../../src/config/database.js';
import { captureLogger } from '../helpers/testApp.js';

const POOLER_URL =
  'postgresql://postgres.abcdefghijkl:p%40ss%2Fw0rd@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

const dbConfig = (overrides = {}) => ({
  url: POOLER_URL,
  sslMode: 'verify-full',
  sslCa: undefined,
  poolMax: 5,
  connectRetries: 2,
  ...overrides,
});

describe('buildSslOptions', () => {
  it('verifies the certificate chain and hostname in verify-full mode', () => {
    expect(buildSslOptions({ sslMode: 'verify-full' })).toEqual({ rejectUnauthorized: true });
    expect(buildSslOptions({ sslMode: 'verify-full', sslCa: 'PEM' })).toEqual({
      rejectUnauthorized: true,
      ca: 'PEM',
    });
  });

  it('encrypts without verification only when require is chosen explicitly', () => {
    expect(buildSslOptions({ sslMode: 'require' })).toEqual({ rejectUnauthorized: false });
  });

  it('turns TLS off in disable mode', () => {
    expect(buildSslOptions({ sslMode: 'disable' })).toBe(false);
  });
});

describe('buildSequelizeOptions', () => {
  it('uses the pg driver and decodes the connection string', () => {
    const options = buildSequelizeOptions(dbConfig({ sslCa: 'PEM' }));

    expect(options).toMatchObject({
      dialect: 'postgres',
      dialectModule: pg,
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      username: 'postgres.abcdefghijkl',
      password: 'p@ss/w0rd',
      pool: { max: 5 },
      logging: false,
    });
    expect(options.dialectOptions.ssl).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
  });

  it('defaults the port to 5432 and the database to postgres', () => {
    const options = buildSequelizeOptions(dbConfig({ url: 'postgres://u:p@db.local' }));
    expect(options.port).toBe(5432);
    expect(options.database).toBe('postgres');
  });

  it('ignores sslmode in the URL so it cannot weaken TLS settings', () => {
    const { logger, entries } = captureLogger();
    const options = buildSequelizeOptions(dbConfig({ url: `${POOLER_URL}?sslmode=no-verify` }), {
      logger,
    });

    expect(options.dialectOptions.ssl).toEqual({ rejectUnauthorized: true });
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('sslmode') }),
    );
  });
});

describe('describeTarget', () => {
  it('never includes credentials', () => {
    const target = describeTarget(dbConfig());
    expect(target).toEqual({
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      sslMode: 'verify-full',
      caProvided: false,
    });
    expect(JSON.stringify(target)).not.toMatch(/p%40ss|p@ss|abcdefghijkl/);
  });
});

describe('describeDatabaseError', () => {
  const wrapped = (code, message = 'boom') => ({
    name: 'SequelizeConnectionError',
    original: Object.assign(new Error(message), { code }),
  });

  it.each([
    ['28P01', false, /Authentication failed/],
    ['SELF_SIGNED_CERT_IN_CHAIN', false, /DATABASE_SSL_CA_PATH/],
    ['ERR_TLS_CERT_ALTNAME_INVALID', false, /does not match/],
    ['3D000', false, /does not exist/],
    ['ENOTFOUND', true, /could not be resolved/],
    ['ENETUNREACH', true, /IPv6-only/],
    ['ECONNREFUSED', true, undefined],
  ])('classifies %s (transient=%s)', (code, transient, hint) => {
    const info = describeDatabaseError(wrapped(code));
    expect(info.code).toBe(code);
    expect(info.transient).toBe(transient);
    if (hint) expect(info.hint).toMatch(hint);
  });

  it('recognises Supavisor "tenant or user not found"', () => {
    const info = describeDatabaseError(wrapped('XX000', 'Tenant or user not found'));
    expect(info.transient).toBe(false);
    expect(info.hint).toMatch(/postgres\.<project-ref>/);
  });
});

describe('createDatabase', () => {
  const refused = () => Object.assign(new Error('refused'), { original: { code: 'ECONNREFUSED' } });

  it('retries transient connection failures and then succeeds', async () => {
    const { logger, entries } = captureLogger();
    const db = createDatabase(dbConfig(), { logger });
    const authenticate = vi
      .spyOn(db.sequelize, 'authenticate')
      .mockRejectedValueOnce(refused())
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce();

    await db.connectWithRetry({ retries: 2, baseDelayMs: 1 });

    expect(authenticate).toHaveBeenCalledTimes(3);
    expect(entries.filter((e) => e.level === 'warn')).toHaveLength(2);
    expect(entries.at(-1)).toMatchObject({
      level: 'info',
      message: 'Database connection established',
    });
    expect(JSON.stringify(entries)).not.toContain('p%40ss');
    await db.close();
  });

  it('gives up after the configured number of retries', async () => {
    const { logger } = captureLogger();
    const db = createDatabase(dbConfig(), { logger });
    const authenticate = vi.spyOn(db.sequelize, 'authenticate').mockRejectedValue(refused());

    await expect(db.connectWithRetry({ retries: 1, baseDelayMs: 1 })).rejects.toThrow(
      'Unable to connect',
    );
    expect(authenticate).toHaveBeenCalledTimes(2);
    await db.close();
  });

  it('does not retry errors that retrying cannot fix', async () => {
    const { logger, entries } = captureLogger();
    const db = createDatabase(dbConfig(), { logger });
    const authenticate = vi
      .spyOn(db.sequelize, 'authenticate')
      .mockRejectedValue(Object.assign(new Error('auth'), { original: { code: '28P01' } }));

    await expect(db.connectWithRetry({ retries: 5, baseDelayMs: 1 })).rejects.toMatchObject({
      info: { code: '28P01', transient: false },
    });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(entries[0]).toMatchObject({
      level: 'error',
      meta: { hint: expect.stringContaining('Authentication') },
    });
    await db.close();
  });

  it('times out a health check that never answers', async () => {
    const db = createDatabase(dbConfig());
    vi.spyOn(db.sequelize, 'query').mockReturnValue(new Promise(() => {}));

    await expect(db.checkConnection({ timeoutMs: 20 })).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });
    await db.close();
  });

  it('resolves a health check when the database answers', async () => {
    const db = createDatabase(dbConfig());
    const query = vi.spyOn(db.sequelize, 'query').mockResolvedValue([[{ '?column?': 1 }], null]);

    await expect(db.checkConnection()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith('SELECT 1', { raw: true });
    await db.close();
  });
});
