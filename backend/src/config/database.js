import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { Sequelize } from 'sequelize';
import { initModels } from '../models/index.js';

/**
 * TLS options for the pg driver.
 *  - verify-full: certificate chain and hostname are verified. Supabase uses its
 *    own root CA, so `ca` must be supplied (DATABASE_SSL_CA[_PATH]).
 *  - require: encrypted, but the server certificate is not verified.
 *  - disable: plaintext (local PostgreSQL only).
 */
export function buildSslOptions({ sslMode, sslCa }) {
  if (sslMode === 'disable') return false;
  if (sslMode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(sslCa && { ca: sslCa }) };
}

/**
 * The connection string is parsed here (rather than handed to Sequelize) so
 * TLS is controlled only by DATABASE_SSL_MODE: pg lets an `sslmode` query
 * parameter silently override explicit ssl options.
 */
export function buildSequelizeOptions(dbConfig, { logger, logQueries = false } = {}) {
  const url = new URL(dbConfig.url);
  if (url.searchParams.has('sslmode') && logger) {
    logger.warn('Ignoring sslmode in DATABASE_URL; TLS is configured by DATABASE_SSL_MODE');
  }

  return {
    dialect: 'postgres',
    dialectModule: pg,
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    dialectOptions: {
      ssl: buildSslOptions(dbConfig),
      application_name: 'edtech-crm-api',
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
      keepAlive: true,
    },
    pool: { max: dbConfig.poolMax, min: 0, acquire: 20_000, idle: 10_000 },
    logging: logQueries && logger ? (sql) => logger.debug(sql) : false,
    define: { underscored: true, freezeTableName: true },
  };
}

/** Where we're connecting, without credentials — safe to log. */
export function describeTarget(dbConfig) {
  const url = new URL(dbConfig.url);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.replace(/^\//, '') || 'postgres',
    sslMode: dbConfig.sslMode,
    caProvided: Boolean(dbConfig.sslCa),
  };
}

const TLS_VERIFY_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
  'CERT_UNTRUSTED',
]);

/**
 * Classifies a connection error: whether retrying could help, and a hint for
 * the operator. Never includes the connection string.
 */
export function describeDatabaseError(err) {
  const original = err?.original ?? err?.parent ?? err;
  const code = original?.code ?? err?.code;
  const message = original?.message ?? err?.message ?? String(err);

  if (code === '28P01' || code === '28000') {
    return {
      code,
      transient: false,
      hint: 'Authentication failed: check the user and password in DATABASE_URL (the pooler user is postgres.<project-ref>).',
    };
  }
  if (/tenant or user not found/i.test(message)) {
    return {
      code: code ?? 'TENANT_NOT_FOUND',
      transient: false,
      hint: 'Supabase pooler does not recognise the user: it must be postgres.<project-ref>, and the region in the host must match your project.',
    };
  }
  if (TLS_VERIFY_CODES.has(code)) {
    return {
      code,
      transient: false,
      hint: 'TLS certificate could not be verified. Download the Supabase CA certificate and set DATABASE_SSL_CA_PATH (or DATABASE_SSL_CA).',
    };
  }
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return {
      code,
      transient: false,
      hint: 'Server certificate does not match the DATABASE_URL host.',
    };
  }
  if (code === '3D000') {
    return {
      code,
      transient: false,
      hint: 'Database name in DATABASE_URL does not exist (Supabase uses "postgres").',
    };
  }
  if (/server does not support ssl/i.test(message)) {
    return {
      code: code ?? 'SSL_NOT_SUPPORTED',
      transient: false,
      hint: 'Server does not accept TLS; for a local database set DATABASE_SSL_MODE=disable.',
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      code,
      transient: true,
      hint: 'Database host could not be resolved: check the host in DATABASE_URL.',
    };
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return {
      code,
      transient: true,
      hint: 'Network unreachable. The direct db.<ref>.supabase.co host is IPv6-only; use the Supabase pooler connection string.',
    };
  }
  return { code: code ?? 'UNKNOWN', transient: true, hint: undefined, message };
}

/**
 * Creates the Sequelize instance and models. Does not connect; call
 * `connectWithRetry` (startup) or `checkConnection` (health checks).
 */
export function createDatabase(dbConfig, { logger, logQueries = false } = {}) {
  const sequelize = new Sequelize(buildSequelizeOptions(dbConfig, { logger, logQueries }));
  const models = initModels(sequelize);

  async function checkConnection({ timeoutMs = 3_000 } = {}) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          Object.assign(new Error(`Database check timed out after ${timeoutMs}ms`), {
            code: 'ETIMEDOUT',
          }),
        );
      }, timeoutMs);
    });
    try {
      await Promise.race([sequelize.query('SELECT 1', { raw: true }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function connectWithRetry({ retries = dbConfig.connectRetries, baseDelayMs = 1_000 } = {}) {
    const target = describeTarget(dbConfig);
    for (let attempt = 1; ; attempt += 1) {
      try {
        await sequelize.authenticate();
        logger?.info('Database connection established', target);
        return;
      } catch (err) {
        const info = describeDatabaseError(err);
        const canRetry = info.transient && attempt <= retries;
        logger?.[canRetry ? 'warn' : 'error']('Database connection failed', {
          ...target,
          attempt,
          code: info.code,
          ...(info.hint ? { hint: info.hint } : { reason: info.message }),
        });
        if (!canRetry) {
          throw Object.assign(new Error('Unable to connect to the database'), { cause: err, info });
        }
        await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), 15_000));
      }
    }
  }

  return {
    sequelize,
    models,
    checkConnection,
    connectWithRetry,
    close: () => sequelize.close(),
  };
}
