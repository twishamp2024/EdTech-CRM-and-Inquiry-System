import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createAuthenticate } from './middleware/authenticate.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import {
  createRequireTrustedOrigin,
  createSessionCsrfGuard,
} from './middleware/requireTrustedOrigin.js';
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
 * @param {{ inquiryService: object, authService: object }} deps.services  business logic (real or test doubles)
 */
export function createApp({ config, logger, checkDatabase, services }) {
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
  app.use(cookieParser());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(
    createSessionCsrfGuard({ allowedOrigins: config.frontendOrigins, cookie: config.auth.cookie }),
  );

  const security = {
    authenticate: createAuthenticate({
      authService: services.authService,
      cookie: config.auth.cookie,
    }),
    requireTrustedOrigin: createRequireTrustedOrigin(config.frontendOrigins),
  };

  app.use('/api', createApiRouter({ config, logger, checkDatabase, services, security }));

  app.use(notFound);
  app.use(errorHandler({ logger }));

  return app;
}
