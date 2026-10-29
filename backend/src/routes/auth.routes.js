import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import { createLoginLimiter } from '../middleware/rateLimiters.js';
import { requireJson } from '../middleware/requireJson.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validators/auth.schema.js';

export function createAuthRouter({ authService, config, security }) {
  const controller = createAuthController({ authService, cookie: config.auth.cookie });
  const router = Router();

  // The origin check on login also blocks login CSRF (signing a victim into
  // an attacker-controlled session).
  router.post(
    '/login',
    createLoginLimiter(config.auth.loginRateLimit),
    security.requireTrustedOrigin,
    requireJson,
    validate({ body: loginSchema }),
    controller.login,
  );
  router.post('/logout', security.requireTrustedOrigin, controller.logout);
  router.get('/me', security.authenticate, controller.me);

  return router;
}
