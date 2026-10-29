import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';

export function createHealthRouter({ checkDatabase, logger }) {
  const controller = createHealthController({ checkDatabase, logger });
  const router = Router();

  router.get('/', controller.liveness);
  router.get('/db', controller.database);

  return router;
}
