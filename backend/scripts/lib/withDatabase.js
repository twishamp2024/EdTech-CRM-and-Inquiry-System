import { createDatabase } from '../../src/config/database.js';
import { ConfigError, loadDatabaseConfig, loadDotenv } from '../../src/config/env.js';
import { createLogger } from '../../src/utils/logger.js';

/**
 * Runs `task({ db, logger, config })` with a connected database, then closes
 * the pool and exits with 0 on success or 1 on failure.
 */
export async function withDatabase(task) {
  loadDotenv();

  let config;
  try {
    config = loadDatabaseConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({ level: config.logLevel === 'silent' ? 'info' : config.logLevel });
  const db = createDatabase(config.database, { logger });

  let exitCode = 0;
  try {
    await db.connectWithRetry({ retries: 0 });
    await task({ db, logger, config });
  } catch (err) {
    exitCode = 1;
    // Connection failures were already logged with a hint by connectWithRetry.
    if (!err?.info) logger.error(err?.message ?? String(err), err?.expected ? undefined : { err });
  } finally {
    await db.close().catch(() => {});
  }
  process.exit(exitCode);
}
