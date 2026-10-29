import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ADMIN_ROLE } from '../constants/auth.js';
import { AppError } from './AppError.js';

const ALGORITHM = 'HS256';

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal(ADMIN_ROLE),
  jti: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export const invalidTokenError = () =>
  new AppError(401, 'INVALID_TOKEN', 'Your session is invalid. Please sign in again.');

export const expiredTokenError = () =>
  new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');

/**
 * Issues and verifies admin access tokens.
 *
 * Claims: `sub` (admin id), `role`, `jti` (token id, used to revoke on
 * logout), `iat`, `exp`, `iss`, `aud`. Nothing else: no email, no secrets.
 * Verification pins the algorithm (rejects `alg: none` and algorithm
 * substitution) and checks signature, expiry, issuer and audience.
 */
export function createTokenService({ secret, expiresIn, issuer, audience }) {
  function issue(adminId) {
    const tokenId = randomUUID();
    const token = jwt.sign({ role: ADMIN_ROLE }, secret, {
      algorithm: ALGORITHM,
      expiresIn,
      issuer,
      audience,
      subject: adminId,
      jwtid: tokenId,
    });
    const { exp } = jwt.decode(token);
    return { token, tokenId, expiresAt: new Date(exp * 1000) };
  }

  /** Returns the verified claims, or throws a 401 AppError. */
  function verify(token) {
    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer, audience });
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw expiredTokenError();
      throw invalidTokenError();
    }
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) throw invalidTokenError();
    return { ...claims.data, expiresAt: new Date(claims.data.exp * 1000) };
  }

  return { issue, verify };
}
