import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { LOG_LEVELS } from '../utils/logger.js';

export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DATABASE_SSL_MODES = Object.freeze(['verify-full', 'require', 'disable']);

const JWT_SECRET_PLACEHOLDER_PREFIX = 'replace-with';

export class ConfigError extends Error {
  constructor(issues) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Loads backend/.env into process.env (existing variables win). */
export function loadDotenv(envPath = path.join(BACKEND_ROOT, '.env')) {
  dotenv.config({ path: envPath, quiet: true });
}

function isPostgresUrl(value) {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('not http(s)');
  return url.origin;
}

const databaseShape = {
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .refine(isPostgresUrl, 'DATABASE_URL must be a postgres:// or postgresql:// connection string'),
  DATABASE_SSL_MODE: z.enum(DATABASE_SSL_MODES).default('verify-full'),
  DATABASE_SSL_CA_PATH: z.string().optional(),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().min(0).max(20).default(5),
};

const serverShape = {
  ...databaseShape,
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      (value) => !value.startsWith(JWT_SECRET_PLACEHOLDER_PREFIX),
      'JWT_SECRET is still the placeholder from .env.example; generate a random secret',
    ),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN must look like 15m, 1h or 7d')
    .default('1h'),
  FRONTEND_URL: z.string({ error: 'FRONTEND_URL is required' }).transform((value, ctx) => {
    const origins = [];
    for (const entry of parseOrigins(value)) {
      try {
        origins.push(toOrigin(entry));
      } catch {
        ctx.addIssue({ code: 'custom', message: `"${entry}" is not a valid http(s) URL` });
        return z.NEVER;
      }
    }
    if (origins.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'FRONTEND_URL must list at least one origin' });
      return z.NEVER;
    }
    return origins;
  }),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
};

function readCertificate(env, baseDir, issues) {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA.replace(/\\n/g, '\n');
  if (!env.DATABASE_SSL_CA_PATH) return undefined;

  const caPath = path.resolve(baseDir, env.DATABASE_SSL_CA_PATH);
  try {
    return fs.readFileSync(caPath, 'utf8');
  } catch {
    issues.push(`DATABASE_SSL_CA_PATH: cannot read certificate file at ${caPath}`);
    return undefined;
  }
}

function buildDatabaseConfig(env, baseDir, issues) {
  if (env.NODE_ENV === 'production' && env.DATABASE_SSL_MODE === 'disable') {
    issues.push('DATABASE_SSL_MODE: "disable" is not allowed when NODE_ENV=production');
  }
  return {
    url: env.DATABASE_URL,
    sslMode: env.DATABASE_SSL_MODE,
    sslCa: env.DATABASE_SSL_MODE === 'disable' ? undefined : readCertificate(env, baseDir, issues),
    poolMax: env.DATABASE_POOL_MAX,
    connectRetries: env.DATABASE_CONNECT_RETRIES,
  };
}

function parse(shape, rawEnv) {
  // Treat empty strings (e.g. `DATABASE_SSL_CA_PATH=`) as unset.
  const env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = z.object(shape).safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Configuration needed by database scripts (no JWT/CORS settings required). */
export function loadDatabaseConfig(rawEnv = process.env, { baseDir = BACKEND_ROOT } = {}) {
  const env = parse(databaseShape, rawEnv);
  const issues = [];
  const database = buildDatabaseConfig(env, baseDir, issues);
  if (issues.length) throw new ConfigError(issues);

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    logLevel: env.LOG_LEVEL,
    database,
  };
}

/** Full configuration for the API server. Throws ConfigError listing every problem. */
export function loadConfig(rawEnv = process.env, { baseDir = BACKEND_ROOT } = {}) {
  const env = parse(serverShape, rawEnv);
  const issues = [];
  const database = buildDatabaseConfig(env, baseDir, issues);
  if (issues.length) throw new ConfigError(issues);

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
    database,
    jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
    frontendOrigins: env.FRONTEND_URL,
    trustProxy: env.TRUST_PROXY,
  });
}
