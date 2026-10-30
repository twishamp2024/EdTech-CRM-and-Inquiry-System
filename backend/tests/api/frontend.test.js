import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { BACKEND_ROOT, ConfigError, loadConfig } from '../../src/config/env.js';
import { FRONTEND_CSP_DIRECTIVES } from '../../src/config/frontendSecurity.js';
import { buildTestApp, TEST_ADMIN, TEST_ENV, TEST_ORIGIN } from '../helpers/testApp.js';

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'edtech-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root">SPA shell</div>');
fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("app")');
fs.writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

const SAME_ORIGIN = { SERVE_FRONTEND: 'true', FRONTEND_DIST_DIR: dist };
const app = buildTestApp({ env: SAME_ORIGIN });

describe('same-origin deployment: Express serves the React build', () => {
  it.each(['/', '/login', '/admin/dashboard', '/admin/dashboard?category=Concert'])(
    'returns the app shell for %s (client routes survive a refresh)',
    async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('SPA shell');
      expect(res.headers['cache-control']).toBe('no-cache');
    },
  );

  it('sends the frontend security headers on pages', async () => {
    const res = await request(app).get('/admin/dashboard');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests'); // only in production
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toMatch(/camera=\(\)/);
  });

  it('serves hashed assets with long-lived caching', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000.*immutable/);
  });

  it('answers a missing asset with 404, not the HTML shell', async () => {
    const res = await request(app).get('/assets/missing.js');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('serves other static files such as the favicon', async () => {
    const res = await request(app).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
  });

  it('never swallows API routes', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );

    for (const url of ['/api', '/api/', '/api/does-not-exist', '/api/admin/dashboard']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).not.toContain('SPA shell');
    }
  });

  it('keeps admin data protected', async () => {
    const res = await request(app).get('/api/inquiries');
    expect(res.status).toBe(401);
  });

  it('only serves pages for GET/HEAD', async () => {
    const res = await request(app).post('/admin/dashboard').set('Origin', TEST_ORIGIN).send({});
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('SPA shell');
  });

  it('is off by default (API-only mode)', async () => {
    const res = await request(buildTestApp()).get('/');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('production settings in same-origin mode', () => {
  const prodEnv = {
    ...SAME_ORIGIN,
    NODE_ENV: 'production',
    DATABASE_SSL_MODE: 'require',
    TRUST_PROXY: '1',
    FRONTEND_URL: undefined,
    RENDER_EXTERNAL_URL: 'https://edtech-crm.onrender.com',
  };
  const prodApp = buildTestApp({ env: prodEnv });

  it('upgrades insecure requests and sends HSTS on pages', async () => {
    const res = await request(prodApp).get('/');
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=63072000; includeSubDomains/);
  });

  it('issues a Secure, HttpOnly, SameSite=Strict __Host- session cookie', async () => {
    const res = await request(prodApp)
      .post('/api/auth/login')
      .set('Origin', 'https://edtech-crm.onrender.com')
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^__Host-edtech_admin_session=/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Domain=/);
  });

  it('accepts state changes only from its own origin', async () => {
    const res = await request(prodApp)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    expect(res.status).toBe(403);
  });
});

describe('configuration', () => {
  it('defaults FRONTEND_URL to Render’s RENDER_EXTERNAL_URL', () => {
    const config = loadConfig({
      ...TEST_ENV,
      FRONTEND_URL: undefined,
      RENDER_EXTERNAL_URL: 'https://edtech-crm.onrender.com',
    });
    expect(config.frontendOrigins).toEqual(['https://edtech-crm.onrender.com']);
  });

  it('lets an explicit FRONTEND_URL win (custom domains)', () => {
    const config = loadConfig({
      ...TEST_ENV,
      FRONTEND_URL: 'https://crm.school.org,https://edtech-crm.onrender.com',
      RENDER_EXTERNAL_URL: 'https://edtech-crm.onrender.com',
    });
    expect(config.frontendOrigins).toEqual([
      'https://crm.school.org',
      'https://edtech-crm.onrender.com',
    ]);
  });

  it('still requires a frontend origin somewhere', () => {
    expect(() => loadConfig({ ...TEST_ENV, FRONTEND_URL: undefined })).toThrow(
      /FRONTEND_URL is required/,
    );
  });

  it('refuses to start in same-origin mode without a frontend build', () => {
    expect(() =>
      loadConfig({
        ...TEST_ENV,
        SERVE_FRONTEND: 'true',
        FRONTEND_DIST_DIR: path.join(dist, 'nope'),
      }),
    ).toThrow(ConfigError);
  });

  it('points at frontend/dist by default', () => {
    expect(loadConfig(TEST_ENV).frontend).toEqual({
      serve: false,
      distDir: path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist'),
    });
  });

  it('uses the same Content-Security-Policy as frontend/vercel.json', () => {
    const vercel = JSON.parse(
      fs.readFileSync(path.join(BACKEND_ROOT, '..', 'frontend', 'vercel.json'), 'utf8'),
    );
    const header = vercel.headers[0].headers.find(
      ({ key }) => key === 'Content-Security-Policy',
    ).value;
    const vercelDirectives = Object.fromEntries(
      header
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .filter(([name]) => name !== 'upgrade-insecure-requests')
        .map(([name, ...values]) => [name, values]),
    );
    expect(vercelDirectives).toEqual(FRONTEND_CSP_DIRECTIVES);
  });
});
