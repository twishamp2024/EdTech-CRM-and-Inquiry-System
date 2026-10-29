import express from 'express';
import helmet from 'helmet';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter } from './routes/index.js';

export const JSON_BODY_LIMIT = '20kb';

/**
 * Builds the Express application without starting a server or connecting to
 * the database, so tests can drive it with Supertest.
 *
 * @param {object} deps
 * @param {object} deps.config          result of loadConfig()
 * @param {object} deps.logger          createLogger() instance
 * @param {() => Promise<void>} deps.checkDatabase  resolves when the DB answers
 */
export function createApp({ config, logger, checkDatabase }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // JSON-only API: nothing here should ever render in a browser frame.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use(requestLogger(logger));
  app.use(createCorsMiddleware(config.frontendOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createApiRouter({ checkDatabase, logger }));

  app.use(notFound);
  app.use(errorHandler({ logger, isProduction: config.isProduction }));

  return app;
}
