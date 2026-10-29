import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
import { BACKEND_ROOT, ConfigError, loadConfig, loadDatabaseConfig } from '../../src/config/env.js';
import { TEST_ENV } from '../helpers/testApp.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edtech-env-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function issuesFor(env) {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err.issues;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig({ ...TEST_ENV, DATABASE_SSL_MODE: undefined });

    expect(config).toMatchObject({
      env: 'test',
      isProduction: false,
      port: 4000,
      logLevel: 'info',
      jwt: { secret: TEST_ENV.JWT_SECRET, expiresIn: '1h' },
      frontendOrigins: ['http://localhost:5173'],
      trustProxy: 0,
      database: {
        url: TEST_ENV.DATABASE_URL,
        sslMode: 'verify-full',
        poolMax: 5,
        connectRetries: 5,
      },
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('normalises FRONTEND_URL entries to origins', () => {
    const config = loadConfig({
      ...TEST_ENV,
      FRONTEND_URL: 'https://app.example.com/, http://localhost:5173/path',
    });
    expect(config.frontendOrigins).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('treats empty strings as unset', () => {
    const config = loadConfig({ ...TEST_ENV, PORT: '', DATABASE_SSL_CA_PATH: '  ' });
    expect(config.port).toBe(4000);
    expect(config.database.sslCa).toBeUndefined();
  });

  it('reports every problem at once', () => {
    const issues = issuesFor({ NODE_ENV: 'test' });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DATABASE_URL'),
        expect.stringContaining('JWT_SECRET'),
        expect.stringContaining('FRONTEND_URL'),
      ]),
    );
  });

  it.each([
    ['mysql://user:pass@host/db', 'postgres:// or postgresql://'],
    ['not a url', 'postgres:// or postgresql://'],
  ])('rejects DATABASE_URL %s', (value, expected) => {
    expect(issuesFor({ ...TEST_ENV, DATABASE_URL: value }).join()).toContain(expected);
  });

  it('rejects short JWT secrets', () => {
    expect(issuesFor({ ...TEST_ENV, JWT_SECRET: 'too-short' }).join()).toContain(
      'at least 32 characters',
    );
  });

  it('rejects the placeholder JWT secret from .env.example', () => {
    const issues = issuesFor({
      ...TEST_ENV,
      JWT_SECRET: 'replace-with-a-random-secret-of-at-least-32-characters',
    });
    expect(issues.join()).toContain('placeholder');
  });

  it('rejects malformed JWT_EXPIRES_IN', () => {
    expect(issuesFor({ ...TEST_ENV, JWT_EXPIRES_IN: 'one hour' }).join()).toContain(
      'JWT_EXPIRES_IN',
    );
  });

  it('rejects invalid FRONTEND_URL entries', () => {
    expect(issuesFor({ ...TEST_ENV, FRONTEND_URL: 'localhost:5173' }).join()).toContain(
      'not a valid http(s) URL',
    );
    expect(issuesFor({ ...TEST_ENV, FRONTEND_URL: ' , ' }).join()).toContain('FRONTEND_URL');
  });

  it('refuses unencrypted database connections in production', () => {
    const issues = issuesFor({ ...TEST_ENV, NODE_ENV: 'production', DATABASE_SSL_MODE: 'disable' });
    expect(issues.join()).toContain('not allowed when NODE_ENV=production');
  });

  it('reads the CA certificate from DATABASE_SSL_CA_PATH relative to the base dir', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'ca.crt'),
      '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n',
    );
    const config = loadConfig(
      { ...TEST_ENV, DATABASE_SSL_MODE: 'verify-full', DATABASE_SSL_CA_PATH: './ca.crt' },
      { baseDir: tmpDir },
    );
    expect(config.database.sslCa).toContain('BEGIN CERTIFICATE');
  });

  it('reports a missing CA file', () => {
    const issues = issuesFor({
      ...TEST_ENV,
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA_PATH: '/no/such/ca.crt',
    });
    expect(issues.join()).toContain('cannot read certificate file');
  });

  it('accepts an inline CA with escaped newlines', () => {
    const config = loadConfig({
      ...TEST_ENV,
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----',
    });
    expect(config.database.sslCa).toBe(
      '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
    );
  });
});

describe('loadDatabaseConfig', () => {
  it('needs only database settings', () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: TEST_ENV.DATABASE_URL,
      DATABASE_SSL_MODE: 'disable',
    });
    expect(config.database).toMatchObject({ url: TEST_ENV.DATABASE_URL, sslMode: 'disable' });
  });
});

describe('.env.example', () => {
  const example = dotenv.parse(fs.readFileSync(path.join(BACKEND_ROOT, '..', '.env.example')));

  it('documents the required variables', () => {
    for (const key of [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_EXPIRES_IN',
      'FRONTEND_URL',
    ]) {
      expect(example).toHaveProperty(key);
    }
  });

  it('contains only placeholders that the server will refuse to run with', () => {
    expect(example.DATABASE_URL).toContain('your-database-password');
    expect(issuesFor({ ...example, DATABASE_SSL_CA_PATH: undefined }).join()).toContain(
      'placeholder',
    );
  });
});
