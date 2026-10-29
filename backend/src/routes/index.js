import { Router } from 'express';
import { createAuthRouter } from './auth.routes.js';
import { createHealthRouter } from './health.routes.js';
import { createInquiryRouter } from './inquiry.routes.js';

/** Mounted at /api. */
export function createApiRouter({ config, logger, checkDatabase, services, security }) {
  const router = Router();

  router.use('/health', createHealthRouter({ checkDatabase, logger }));
  router.use('/auth', createAuthRouter({ authService: services.authService, config, security }));
  router.use(
    '/inquiries',
    createInquiryRouter({ inquiryService: services.inquiryService, config, security }),
  );

  return router;
}
