import { Sequelize } from 'sequelize';
import pg from 'pg';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { initModels } from '../../src/models/index.js';
import { silentLogger } from '../../src/utils/logger.js';

export const TEST_ORIGIN = 'http://localhost:5173';

export const TEST_ENV = Object.freeze({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test_user:test_password@localhost:5432/edtech_test',
  DATABASE_SSL_MODE: 'disable',
  JWT_SECRET: 'test-only-secret-that-is-long-enough-1234567890',
  FRONTEND_URL: TEST_ORIGIN,
});

export function buildTestApp({
  env = {},
  checkDatabase = async () => {},
  logger = silentLogger,
} = {}) {
  const config = loadConfig({ ...TEST_ENV, ...env });
  return createApp({ config, logger, checkDatabase });
}

/** Models on a Sequelize instance that never connects (definition/validation tests only). */
export function buildOfflineModels() {
  const sequelize = new Sequelize('postgres://offline:offline@127.0.0.1:1/offline', {
    dialect: 'postgres',
    dialectModule: pg,
    logging: false,
  });
  return { sequelize, ...initModels(sequelize) };
}

export function captureLogger() {
  const entries = [];
  const record = (level) => (message, meta) => entries.push({ level, message, meta });
  return {
    entries,
    logger: {
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
    },
  };
}
