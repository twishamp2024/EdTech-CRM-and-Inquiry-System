import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_ORIGIN } from '../helpers/testApp.js';

describe('unknown routes', () => {
  it('return a JSON 404 envelope', async () => {
    const res = await request(buildTestApp()).get('/api/does-not-exist?phone=12345');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
    });
  });
});

describe('CORS', () => {
  it('allows the configured frontend origin', async () => {
    const res = await request(buildTestApp()).get('/api/health').set('Origin', TEST_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
  });

  it('answers preflight requests for the configured origin', async () => {
    const res = await request(buildTestApp())
      .options('/api/inquiries')
      .set('Origin', TEST_ORIGIN)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type');
    // Cookies may be sent cross-origin only to allowed origins.
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects other origins with 403', async () => {
    const res = await request(buildTestApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_ORIGIN_DENIED');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports several comma-separated origins in FRONTEND_URL', async () => {
    const app = buildTestApp({
      env: { FRONTEND_URL: 'https://crm.example.com/, http://localhost:5173' },
    });
    const res = await request(app).get('/api/health').set('Origin', 'https://crm.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://crm.example.com');
  });

  it('lets requests without an Origin header through (curl, health checks)', async () => {
    const res = await request(buildTestApp()).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('JSON body parsing', () => {
  it('rejects malformed JSON with 400', async () => {
    const res = await request(buildTestApp())
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects bodies over the size limit with 413', async () => {
    const res = await request(buildTestApp())
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: 'x'.repeat(25 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
