import { createApp } from './app.js';
import { createDatabase } from './config/database.js';
import { ConfigError, loadConfig, loadDotenv } from './config/env.js';
import { createLogger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function loadConfigOrExit() {
  loadDotenv();
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\nSee .env.example for every supported variable.\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const config = loadConfigOrExit();
  const logger = createLogger({
    level: config.logLevel,
    format: config.isProduction ? 'json' : 'pretty',
  });

  if (config.database.sslMode === 'require') {
    logger.warn(
      'DATABASE_SSL_MODE=require: traffic is encrypted but the server certificate is NOT verified',
    );
  } else if (config.database.sslMode === 'verify-full' && !config.database.sslCa) {
    logger.warn(
      "No DATABASE_SSL_CA[_PATH] set; verification uses system CAs, which do not include Supabase's root CA",
    );
  }

  const db = createDatabase(config.database, { logger, logQueries: config.logLevel === 'debug' });

  try {
    await db.connectWithRetry();
  } catch {
    // connectWithRetry has already logged the cause and a hint.
    logger.error('Exiting: the API cannot start without a database connection');
    await db.close().catch(() => {});
    process.exit(1);
  }

  const app = createApp({ config, logger, checkDatabase: () => db.checkConnection() });
  const server = app.listen(config.port, () => {
    logger.info(`API listening on port ${config.port}`, { env: config.env });
  });

  server.on('error', async (err) => {
    logger.error(
      err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use` : 'HTTP server error',
      { err },
    );
    await db.close().catch(() => {});
    process.exit(1);
  });

  let shuttingDown = false;
  async function shutdown(signal, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);

    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    server.close(async () => {
      await db.close().catch((err) => logger.error('Error closing database pool', { err }));
      clearTimeout(force);
      process.exit(exitCode);
    });
    server.closeIdleConnections();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      err: reason instanceof Error ? reason : new Error(String(reason)),
    });
    shutdown('unhandledRejection', 1);
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal startup error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
