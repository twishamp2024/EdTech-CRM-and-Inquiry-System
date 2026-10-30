// Regression guard: walks the real routers so a new route cannot be added
// without authentication by accident. Only POST /api/inquiries (the public
// form), the health checks and login/logout may answer without a session.

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createAuthRouter } from '../../src/routes/auth.routes.js';
import { createInquiryRouter } from '../../src/routes/inquiry.routes.js';
import {
  buildTestApp,
  TEST_ENV,
  TEST_ORIGIN,
  unstubbedInquiryService,
} from '../helpers/testApp.js';

const config = loadConfig(TEST_ENV);
const marker = (name) => Object.defineProperty(() => {}, 'name', { value: name });
const security = {
  authenticate: marker('authenticate'),
  requireTrustedOrigin: marker('requireTrustedOrigin'),
};

/** Route and middleware layers of an Express router, in registration order. */
function layersOf(router) {
  return router.stack.map((layer) =>
    layer.route
      ? {
          type: 'route',
          path: layer.route.path,
          methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
          handlers: layer.route.stack.map((s) => s.handle.name),
        }
      : { type: 'middleware', name: layer.handle.name },
  );
}

const inquiryLayers = layersOf(
  createInquiryRouter({ inquiryService: unstubbedInquiryService, config, security }),
);
const authLayers = layersOf(createAuthRouter({ authService: {}, config, security }));

const SAMPLE_ID = '6f1c3c1e-3f5b-4c8e-9a51-2b0b7f0e9d11';
const concrete = (path) => path.replace(':id', SAMPLE_ID);

describe('inquiry router', () => {
  const routes = inquiryLayers.filter((layer) => layer.type === 'route');
  const authIndex = inquiryLayers.findIndex((layer) => layer.name === 'authenticate');

  it('has exactly one public route: POST /', () => {
    const publicRoutes = inquiryLayers
      .slice(0, authIndex)
      .filter((layer) => layer.type === 'route')
      .map((layer) => `${layer.methods.join(',').toUpperCase()} ${layer.path}`);
    expect(publicRoutes).toEqual(['POST /']);
  });

  it('mounts authentication and the admin role check before every other route', () => {
    expect(authIndex).toBeGreaterThan(0);
    const after = inquiryLayers.slice(authIndex + 1);
    expect(after.filter((layer) => layer.type === 'middleware').map((layer) => layer.name)).toEqual(
      ['requireRoleMiddleware'],
    );
    expect(after[0]).toEqual({ type: 'middleware', name: 'requireRoleMiddleware' });
    expect(after.filter((layer) => layer.type === 'route').length).toBe(routes.length - 1);
  });

  it('requires a trusted origin on every state-changing admin route', () => {
    const unsafe = inquiryLayers
      .slice(authIndex)
      .filter(
        (layer) =>
          layer.type === 'route' && layer.methods.some((m) => !['get', 'head'].includes(m)),
      );
    expect(unsafe.length).toBeGreaterThan(0);
    for (const layer of unsafe) expect(layer.handlers).toContain('requireTrustedOrigin');
  });

  it.each(routes.filter((route) => !(route.path === '/' && route.methods.includes('post'))))(
    'answers 401 to anonymous $methods $path',
    async ({ methods, path }) => {
      const client = request(buildTestApp());
      for (const method of methods) {
        const url = `/api/inquiries${concrete(path)}`;
        const res = await client[method](url).set('Origin', TEST_ORIGIN);
        expect(res.status).toBe(401);
        expect(res.body).not.toHaveProperty('data');
      }
    },
  );
});

describe('auth router', () => {
  it('protects GET /me and leaves only login/logout open', () => {
    const routes = authLayers.filter((layer) => layer.type === 'route');
    const summary = routes.map(
      (r) =>
        `${r.methods.join(',').toUpperCase()} ${r.path} ${r.handlers.includes('authenticate') ? 'auth' : 'open'}`,
    );
    expect(summary).toEqual(['POST /login open', 'POST /logout open', 'GET /me auth']);
    for (const route of routes.filter((r) => r.methods.includes('post'))) {
      expect(route.handlers).toContain('requireTrustedOrigin');
    }
  });
});
