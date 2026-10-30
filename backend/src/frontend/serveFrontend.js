import path from 'node:path';
import express, { Router } from 'express';
import helmet from 'helmet';
import {
  FRONTEND_CSP_DIRECTIVES,
  FRONTEND_PERMISSIONS_POLICY,
} from '../config/frontendSecurity.js';
import { AppError } from '../utils/AppError.js';

const isApiPath = (requestPath) => requestPath === '/api' || requestPath.startsWith('/api/');

/**
 * Serves the built React app (frontend/dist) from the API's own origin:
 *  - hashed files under /assets are cached for a year; a missing asset is a
 *    404, never the HTML shell;
 *  - any other GET (/, /login, /admin/dashboard, …) returns index.html so
 *    client-side routes survive a refresh;
 *  - /api/* is never handled here, so unknown API paths still get JSON 404s.
 * Pages get the frontend Content-Security-Policy, not the API's.
 */
export function createFrontendMiddleware({ distDir, isProduction }) {
  const indexFile = path.join(distDir, 'index.html');
  const router = Router();

  router.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          ...FRONTEND_CSP_DIRECTIVES,
          ...(isProduction && { 'upgrade-insecure-requests': [] }),
        },
      },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
    }),
  );
  router.use((_req, res, next) => {
    res.set('Permissions-Policy', FRONTEND_PERMISSIONS_POLICY);
    next();
  });

  router.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { index: false, immutable: true, maxAge: '1y' }),
    (req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Asset not found')),
  );
  router.use(express.static(distDir, { index: false, maxAge: '1h' }));

  router.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  return (req, res, next) => (isApiPath(req.path) ? next() : router(req, res, next));
}
