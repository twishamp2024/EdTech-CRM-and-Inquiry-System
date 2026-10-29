import cors from 'cors';
import { AppError } from '../utils/AppError.js';

/**
 * Allows browser requests only from configured frontend origins (FRONTEND_URL).
 * Requests without an Origin header (curl, server-to-server, health checks)
 * are not browser cross-origin requests and pass through; CORS is not an
 * authentication mechanism — protected routes still require a JWT.
 */
export function createCorsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return cors({
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(
        new AppError(403, 'CORS_ORIGIN_DENIED', 'This origin is not allowed to access the API'),
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}
