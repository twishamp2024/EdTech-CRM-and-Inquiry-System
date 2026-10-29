import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE } from '../../src/constants/auth.js';
import {
  buildTestAppWithKit,
  signTestToken,
  TEST_ADMIN,
  TEST_ENV,
  TEST_ORIGIN,
} from '../helpers/testApp.js';

const COOKIE = 'edtech_admin_session';
const credentials = { email: TEST_ADMIN.email, password: TEST_ADMIN.password };

const login = (app, body = credentials, origin = TEST_ORIGIN) => {
  const req = request(app).post('/api/auth/login');
  if (origin) req.set('Origin', origin);
  return req.send(body);
};

function sessionCookie(res) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE}=`));
  return header && { header, value: header.split(';')[0].slice(COOKIE.length + 1) };
}

const withCookie = (req, token) => req.set('Cookie', `${COOKIE}=${token}`);

describe('POST /api/auth/login', () => {
  it('signs in with valid credentials and sets a hardened session cookie', async () => {
    const { app } = buildTestAppWithKit();
    const res = await login(app);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Signed in successfully.',
      data: {
        admin: { id: TEST_ADMIN.id, email: TEST_ADMIN.email, role: ADMIN_ROLE },
        expiresAt: expect.any(String),
      },
    });
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = sessionCookie(res);
    expect(cookie.header).toMatch(/; HttpOnly/);
    expect(cookie.header).toMatch(/; SameSite=Strict/);
    expect(cookie.header).toMatch(/; Path=\//);
    expect(cookie.header).toMatch(/; Max-Age=(3599|3600)/);
    expect(cookie.header).not.toMatch(/Domain=/);
    // The token lives only in the HttpOnly cookie, never in the JSON body.
    expect(JSON.stringify(res.body)).not.toContain(cookie.value);
  });

  it('marks the cookie Secure with a __Host- name in production', async () => {
    const { app } = buildTestAppWithKit({
      env: { NODE_ENV: 'production', DATABASE_SSL_MODE: 'require' },
    });
    const res = await login(app);

    const header = res.headers['set-cookie'].find((c) =>
      c.startsWith('__Host-edtech_admin_session='),
    );
    expect(header).toMatch(/; Secure/);
    expect(header).toMatch(/; HttpOnly/);
    expect(header).toMatch(/; Path=\//);
  });

  it('normalises the email before looking it up', async () => {
    const { app } = buildTestAppWithKit();
    const res = await login(app, { ...credentials, email: '  ADMIN@Example.com ' });
    expect(res.status).toBe(200);
  });

  it('rejects an incorrect password with a generic 401 and no cookie', async () => {
    const { app } = buildTestAppWithKit();
    const res = await login(app, { ...credentials, password: 'wrong password entirely' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('rejects an unknown email with exactly the same response', async () => {
    const { app } = buildTestAppWithKit();
    const wrongPassword = await login(app, { ...credentials, password: 'wrong password entirely' });
    const unknownEmail = await login(app, { ...credentials, email: 'nobody@example.com' });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(sessionCookie(unknownEmail)).toBeUndefined();
  });

  it('does not trim or alter the password', async () => {
    const { app } = buildTestAppWithKit();
    const res = await login(app, { ...credentials, password: ` ${TEST_ADMIN.password} ` });
    expect(res.status).toBe(401);
  });

  describe('malformed requests (400 / 415)', () => {
    it.each([
      [{}, ['email', 'password']],
      [{ email: credentials.email }, ['password']],
      [{ password: credentials.password }, ['email']],
      [{ ...credentials, email: 'not-an-email' }, ['email']],
      [{ ...credentials, password: '' }, ['password']],
      [{ ...credentials, password: 12345 }, ['password']],
      [{ ...credentials, password: 'x'.repeat(1025) }, ['password']],
      [{ ...credentials, role: 'superadmin' }, ['role']],
    ])('rejects %o', async (body, fields) => {
      const { app } = buildTestAppWithKit();
      const res = await login(app, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d) => d.field)).toEqual(fields);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('rejects malformed JSON', async () => {
      const { app } = buildTestAppWithKit();
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('rejects non-JSON bodies', async () => {
      const { app } = buildTestAppWithKit();
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .type('form')
        .send(credentials);
      expect(res.status).toBe(415);
    });
  });

  describe('origin protection', () => {
    it('rejects a login without an Origin or Referer (login CSRF)', async () => {
      const { app } = buildTestAppWithKit();
      const res = await login(app, credentials, null);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('rejects a login from a foreign site', async () => {
      const { app } = buildTestAppWithKit();
      const res = await login(app, credentials, 'https://evil.example');
      expect(res.status).toBe(403);
      expect(sessionCookie(res)).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    const env = { LOGIN_RATE_LIMIT_MAX: '3' };

    it('blocks further attempts after repeated failures', async () => {
      const { app } = buildTestAppWithKit({ env });
      const bad = { ...credentials, password: 'wrong password entirely' };
      for (let i = 0; i < 3; i += 1) expect((await login(app, bad)).status).toBe(401);

      const blocked = await login(app, credentials);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(sessionCookie(blocked)).toBeUndefined();
    });

    it('does not count successful sign-ins', async () => {
      const { app } = buildTestAppWithKit({ env });
      for (let i = 0; i < 5; i += 1) expect((await login(app)).status).toBe(200);
    });
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in admin', async () => {
    const { app } = buildTestAppWithKit();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').set('Origin', TEST_ORIGIN).send(credentials);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.admin).toEqual({
      id: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      role: ADMIN_ROLE,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 401 AUTH_REQUIRED without a cookie', async () => {
    const { app } = buildTestAppWithKit();
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('ignores an Authorization header (cookie-only)', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token with an invalid signature and clears the cookie', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    const res = await withCookie(request(app).get('/api/auth/me'), `${token.slice(0, -3)}abc`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect(sessionCookie(res).header).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('rejects a token signed with a different secret', async () => {
    const { app, config } = buildTestAppWithKit();
    const forged = signTestToken(
      config,
      { role: ADMIN_ROLE, jti: '9d2f0c5e-1b7a-4e3c-8f6d-2a4b6c8e0f12' },
      { subject: TEST_ADMIN.id, secret: 'attacker-chosen-secret-that-is-long-enough' },
    );
    const res = await withCookie(request(app).get('/api/auth/me'), forged);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const { app, config } = buildTestAppWithKit();
    const expired = signTestToken(
      config,
      { role: ADMIN_ROLE, jti: '9d2f0c5e-1b7a-4e3c-8f6d-2a4b6c8e0f12' },
      { subject: TEST_ADMIN.id, expiresIn: -1 },
    );
    const res = await withCookie(request(app).get('/api/auth/me'), expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it.each(['garbage', 'a.b.c', '%E0%A4%A'])('rejects the malformed token %j', async (token) => {
    const { app } = buildTestAppWithKit();
    const res = await withCookie(request(app).get('/api/auth/me'), token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a valid token for an admin who no longer exists', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    kit.admins.remove(TEST_ADMIN.id);
    const res = await withCookie(request(app).get('/api/auth/me'), token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('takes the role from the server, never from the request', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    const res = await withCookie(request(app).get('/api/auth/me?role=superadmin'), token)
      .set('X-Role', 'superadmin')
      .set('X-User-Id', '00000000-0000-4000-8000-000000000000');
    expect(res.body.data.admin).toEqual({
      id: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      role: ADMIN_ROLE,
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie with the same attributes and ends the session', async () => {
    const { app } = buildTestAppWithKit();
    const agent = request.agent(app);
    const signIn = await agent.post('/api/auth/login').set('Origin', TEST_ORIGIN).send(credentials);
    const token = sessionCookie(signIn).value;
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const res = await agent.post('/api/auth/logout').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Signed out.' });
    const cleared = sessionCookie(res).header;
    expect(cleared).toMatch(new RegExp(`^${COOKIE}=;`));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/; Path=\//);
    expect(cleared).toMatch(/; HttpOnly/);
    expect(cleared).toMatch(/; SameSite=Strict/);

    // The browser no longer has the cookie…
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('AUTH_REQUIRED');

    // …and a copy of the old token is refused too.
    const replay = await withCookie(request(app).get('/api/auth/me'), token);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('is idempotent when no session exists', async () => {
    const { app } = buildTestAppWithKit();
    const res = await request(app).post('/api/auth/logout').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
  });

  it('requires a trusted origin (logout CSRF)', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    const res = await withCookie(request(app).post('/api/auth/logout'), token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    // Session still valid: the forged request had no effect.
    expect((await withCookie(request(app).get('/api/auth/me'), token)).status).toBe(200);
  });
});

describe('session cookie CSRF guard on other endpoints', () => {
  it('rejects a cookie-carrying unsafe request without a trusted origin', async () => {
    const { app, kit } = buildTestAppWithKit();
    const { token } = kit.tokenService.issue(TEST_ADMIN.id);
    const res = await withCookie(request(app).post('/api/inquiries'), token).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('leaves cookie-less public submissions alone', async () => {
    const { app } = buildTestAppWithKit({ env: TEST_ENV });
    const res = await request(app).post('/api/inquiries').send({});
    expect(res.status).toBe(400);
  });
});
