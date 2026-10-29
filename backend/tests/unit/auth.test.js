import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_ROLE } from '../../src/constants/auth.js';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { requireRole } from '../../src/middleware/authenticate.js';
import {
  createRequireTrustedOrigin,
  requestOrigin,
} from '../../src/middleware/requireTrustedOrigin.js';
import { createTokenRevocationList } from '../../src/services/tokenRevocation.js';
import { createTokenService } from '../../src/utils/jwt.js';
import {
  bcryptCost,
  getDummyHash,
  hashPassword,
  verifyPassword,
} from '../../src/utils/password.js';
import { validateNewPassword } from '../../src/validators/auth.schema.js';
import { signTestToken, TEST_ADMIN, TEST_ENV } from '../helpers/testApp.js';

const config = loadConfig(TEST_ENV);
const tokens = createTokenService(config.jwt);

describe('password hashing', () => {
  it('produces a salted bcrypt hash at the requested cost, never the plaintext', async () => {
    const hash = await hashPassword('a perfectly fine passphrase', 12);
    expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
    expect(hash).not.toContain('a perfectly fine passphrase');
    expect(bcryptCost(hash)).toBe(12);
    expect(await hashPassword('a perfectly fine passphrase', 10)).not.toBe(hash); // salted
  });

  it('verifies with bcrypt.compare', async () => {
    const hash = await hashPassword('a perfectly fine passphrase', 10);
    expect(await verifyPassword('a perfectly fine passphrase', hash)).toBe(true);
    expect(await verifyPassword('a perfectly fine passphrasE', hash)).toBe(false);
  });

  it('caches one dummy hash per work factor', async () => {
    const first = await getDummyHash(10);
    expect(await getDummyHash(10)).toBe(first);
    expect(bcryptCost(first)).toBe(10);
  });
});

describe('validateNewPassword', () => {
  it('accepts a long, varied password', () => {
    expect(validateNewPassword('river-lantern-47-quietly', { email: 'ops@school.org' })).toEqual(
      [],
    );
  });

  it.each([
    ['short1!', /at least 12 characters/],
    ['a'.repeat(73), /at most 72 bytes/],
    ['é'.repeat(40), /at most 72 bytes/],
    ['            ', /whitespace/],
    ['abababababab', /5 different characters/],
    ['Password1234', /too common/],
    ['principal-2026-secure', /email address/],
  ])('rejects %j', (password, expected) => {
    expect(validateNewPassword(password, { email: 'principal@school.org' }).join(' ')).toMatch(
      expected,
    );
  });

  it('requires a password', () => {
    expect(validateNewPassword(undefined)).toEqual(['Password is required']);
    expect(validateNewPassword('')).toEqual(['Password is required']);
  });
});

describe('token service', () => {
  it('issues a token with only the necessary claims', () => {
    const before = Math.floor(Date.now() / 1000);
    const { token, tokenId, expiresAt } = tokens.issue(TEST_ADMIN.id);
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(decoded.payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sub'].sort(),
    );
    expect(decoded.payload).toMatchObject({
      sub: TEST_ADMIN.id,
      role: ADMIN_ROLE,
      jti: tokenId,
      iss: 'edtech-crm-api',
      aud: 'edtech-crm-admin',
    });
    expect(decoded.payload.exp - decoded.payload.iat).toBe(3600);
    expect(decoded.payload.iat).toBeGreaterThanOrEqual(before);
    expect(expiresAt.getTime()).toBe(decoded.payload.exp * 1000);
    expect(token).not.toContain(TEST_ADMIN.email);
  });

  it('verifies a valid token', () => {
    const { token } = tokens.issue(TEST_ADMIN.id);
    expect(tokens.verify(token)).toMatchObject({ sub: TEST_ADMIN.id, role: ADMIN_ROLE });
  });

  const valid = () => tokens.issue(TEST_ADMIN.id).token;
  const claims = { role: ADMIN_ROLE, jti: '9d2f0c5e-1b7a-4e3c-8f6d-2a4b6c8e0f12' };

  it.each([
    [
      'a tampered payload',
      () => {
        const [h, , s] = valid().split('.');
        const forged = Buffer.from(
          JSON.stringify({ ...claims, sub: TEST_ADMIN.id, role: 'superadmin' }),
        ).toString('base64url');
        return `${h}.${forged}.${s}`;
      },
    ],
    ['a tampered signature', () => `${valid().slice(0, -4)}AAAA`],
    [
      'another secret',
      () => signTestToken(config, claims, { subject: TEST_ADMIN.id, secret: 'x'.repeat(48) }),
    ],
    [
      'the wrong issuer',
      () => signTestToken(config, claims, { subject: TEST_ADMIN.id, issuer: 'someone-else' }),
    ],
    [
      'the wrong audience',
      () => signTestToken(config, claims, { subject: TEST_ADMIN.id, audience: 'public' }),
    ],
    [
      'HS512 instead of HS256',
      () => signTestToken(config, claims, { subject: TEST_ADMIN.id, algorithm: 'HS512' }),
    ],
    [
      'alg "none"',
      () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
          'base64url',
        );
        const now = Math.floor(Date.now() / 1000);
        const payload = Buffer.from(
          JSON.stringify({
            ...claims,
            sub: TEST_ADMIN.id,
            iss: 'edtech-crm-api',
            aud: 'edtech-crm-admin',
            iat: now,
            exp: now + 600,
          }),
        ).toString('base64url');
        return `${header}.${payload}.`;
      },
    ],
    [
      'a role other than admin',
      () => signTestToken(config, { ...claims, role: 'superadmin' }, { subject: TEST_ADMIN.id }),
    ],
    ['no subject', () => signTestToken(config, claims)],
    ['a non-UUID subject', () => signTestToken(config, claims, { subject: 'admin' })],
    ['no token id', () => signTestToken(config, { role: ADMIN_ROLE }, { subject: TEST_ADMIN.id })],
    ['garbage', () => 'not-a-jwt'],
    ['an empty string', () => ''],
  ])('rejects a token with %s as INVALID_TOKEN', (_label, makeToken) => {
    expect(() => tokens.verify(makeToken())).toThrow(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });

  it('rejects an expired token as TOKEN_EXPIRED', () => {
    const expired = signTestToken(config, claims, { subject: TEST_ADMIN.id, expiresIn: -10 });
    expect(() => tokens.verify(expired)).toThrow(
      expect.objectContaining({ status: 401, code: 'TOKEN_EXPIRED' }),
    );
  });
});

describe('token revocation list', () => {
  it('remembers revoked ids until they would have expired', () => {
    let now = 1_000;
    const list = createTokenRevocationList({ now: () => now });
    list.revoke('a', new Date(5_000));
    expect(list.isRevoked('a')).toBe(true);
    expect(list.isRevoked('b')).toBe(false);
    now = 5_000;
    expect(list.isRevoked('a')).toBe(false);
    expect(list.size).toBe(0);
  });
});

describe('requireRole', () => {
  const run = (auth, ...roles) => {
    const next = vi.fn();
    requireRole(...roles)({ auth }, {}, next);
    return next.mock.calls[0][0];
  };
  const admin = { admin: { id: TEST_ADMIN.id, email: TEST_ADMIN.email, role: ADMIN_ROLE } };

  it('allows an identity with a permitted role', () => {
    expect(run(admin, ADMIN_ROLE)).toBeUndefined();
  });

  it('returns 403 for an authenticated identity without the role', () => {
    expect(run(admin, 'superadmin')).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('returns 401 when nobody is authenticated', () => {
    expect(run(undefined, ADMIN_ROLE)).toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
  });
});

describe('requireTrustedOrigin', () => {
  const check = createRequireTrustedOrigin(['https://crm.example.com']);
  const run = (method, headers) => {
    const next = vi.fn();
    const req = { method, get: (name) => headers[name.toLowerCase()] };
    check(req, {}, next);
    return next.mock.calls[0][0];
  };

  it('lets safe methods through without an origin', () => {
    expect(run('GET', {})).toBeUndefined();
  });

  it('accepts unsafe requests from an allowed Origin or Referer', () => {
    expect(run('POST', { origin: 'https://crm.example.com' })).toBeUndefined();
    expect(run('PATCH', { referer: 'https://crm.example.com/admin?x=1' })).toBeUndefined();
  });

  it.each([
    ['no Origin or Referer', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['Origin "null"', { origin: 'null' }],
    ['a look-alike Origin', { origin: 'https://crm.example.com.evil.example' }],
    ['a foreign Referer', { referer: 'https://evil.example/crm.example.com' }],
    ['an unparsable Referer', { referer: '::::' }],
  ])('rejects unsafe requests with %s', (_label, headers) => {
    expect(run('POST', headers)).toMatchObject({ status: 403, code: 'ORIGIN_NOT_ALLOWED' });
  });

  it('extracts the origin from Referer when Origin is absent', () => {
    expect(requestOrigin({ get: (n) => ({ referer: 'http://localhost:5173/admin' })[n] })).toBe(
      'http://localhost:5173',
    );
  });
});

describe('auth configuration', () => {
  const issues = (env) => {
    try {
      loadConfig({ ...TEST_ENV, ...env });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      return err.issues.join(' ');
    }
    return '';
  };

  it('uses an HttpOnly-ready, non-Secure cookie outside production', () => {
    expect(config.auth.cookie).toEqual({
      name: 'edtech_admin_session',
      secure: false,
      sameSite: 'strict',
      path: '/',
    });
    expect(config.jwt).toMatchObject({
      expiresIn: '1h',
      issuer: 'edtech-crm-api',
      audience: 'edtech-crm-admin',
    });
    expect(config.auth.bcryptRounds).toBe(10);
  });

  it('uses a Secure __Host- cookie in production', () => {
    const prod = loadConfig({ ...TEST_ENV, NODE_ENV: 'production', DATABASE_SSL_MODE: 'require' });
    expect(prod.auth.cookie).toMatchObject({ name: '__Host-edtech_admin_session', secure: true });
  });

  it('defaults bcrypt to a work factor of 12', () => {
    expect(loadConfig({ ...TEST_ENV, BCRYPT_SALT_ROUNDS: undefined }).auth.bcryptRounds).toBe(12);
  });

  it.each([
    [
      { NODE_ENV: 'production', DATABASE_SSL_MODE: 'require', AUTH_COOKIE_SECURE: 'false' },
      /must be true/,
    ],
    [{ AUTH_COOKIE_SAMESITE: 'none' }, /requires AUTH_COOKIE_SECURE=true/],
    [{ AUTH_COOKIE_SECURE: 'yes' }, /"true" or "false"/],
    [{ BCRYPT_SALT_ROUNDS: '8' }, /BCRYPT_SALT_ROUNDS/],
  ])('rejects unsafe settings %o', (env, expected) => {
    expect(issues(env)).toMatch(expected);
  });
});
