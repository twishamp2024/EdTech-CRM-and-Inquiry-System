import { describeDatabaseError } from '../config/database.js';

const SERVICE_NAME = 'edtech-crm-api';

/**
 * `checkDatabase` is injected so the API can be tested without a database.
 * It must resolve when the database answers and reject otherwise.
 */
export function createHealthController({ checkDatabase, logger }) {
  return {
    /** Liveness: the process is up and serving HTTP. Does not touch the database. */
    liveness(_req, res) {
      res.set('Cache-Control', 'no-store').json({
        status: 'ok',
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      });
    },

    /** Readiness: the database is reachable. Returns 503 when it is not. */
    async database(_req, res) {
      const started = performance.now();
      res.set('Cache-Control', 'no-store');
      try {
        await checkDatabase();
        res.json({
          status: 'ok',
          database: 'up',
          latencyMs: Math.round(performance.now() - started),
        });
      } catch (err) {
        logger.warn('Database health check failed', { code: describeDatabaseError(err).code });
        res.status(503).json({ status: 'error', database: 'down' });
      }
    },
  };
}
