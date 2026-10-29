import { Router } from 'express';
import { createHealthRouter } from './health.routes.js';

/** Mounted at /api. Auth and inquiry routers are added in later stages. */
export function createApiRouter({ checkDatabase, logger }) {
  const router = Router();

  router.use('/health', createHealthRouter({ checkDatabase, logger }));

  return router;
}
