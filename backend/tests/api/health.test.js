import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../helpers/testApp.js';

describe('GET /api/health', () => {
  it('reports the service as up without touching the database', async () => {
    const checkDatabase = vi.fn();
    const res = await request(buildTestApp({ checkDatabase })).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ status: 'ok', service: 'edtech-crm-api' });
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    expect(res.body.uptimeSeconds).toBeTypeOf('number');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it('sends Helmet security headers and hides the framework', async () => {
    const res = await request(buildTestApp()).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });
});

describe('GET /api/health/db', () => {
  it('returns 200 when the database answers', async () => {
    const checkDatabase = vi.fn().mockResolvedValue();
    const res = await request(buildTestApp({ checkDatabase })).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.body.latencyMs).toBeTypeOf('number');
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('returns 503 without leaking error details when the database is down', async () => {
    const checkDatabase = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }),
      );
    const res = await request(buildTestApp({ checkDatabase })).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.1');
  });
});
