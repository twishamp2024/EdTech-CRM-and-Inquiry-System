import { ADMIN_ROLE } from '../constants/auth.js';
import { AppError } from '../utils/AppError.js';
import { getDummyHash, verifyPassword } from '../utils/password.js';
import { invalidTokenError } from '../utils/jwt.js';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);

const toIdentity = (admin) => ({ id: admin.id, email: admin.email, role: ADMIN_ROLE });

/**
 * @param {object} deps
 * @param {ReturnType<import('./admin.repository.js').createAdminRepository>} deps.admins
 * @param {ReturnType<import('../utils/jwt.js').createTokenService>} deps.tokenService
 * @param {ReturnType<import('./tokenRevocation.js').createTokenRevocationList>} deps.revocationList
 * @param {number} deps.bcryptRounds  work factor for the timing-equalising dummy hash
 */
export function createAuthService({ admins, tokenService, revocationList, bcryptRounds }) {
  /**
   * Verifies credentials and issues a token. Unknown email and wrong password
   * produce the same error, and both run one bcrypt comparison.
   */
  async function login(email, password) {
    const admin = await admins.findByEmailWithPassword(email);
    const hash = admin?.passwordHash ?? (await getDummyHash(bcryptRounds));
    const passwordMatches = await verifyPassword(password, hash);
    if (!admin || !passwordMatches) throw invalidCredentials();

    const { token, tokenId, expiresAt } = tokenService.issue(admin.id);
    return { admin: toIdentity(admin), token, tokenId, expiresAt };
  }

  /**
   * Turns a token into the current admin identity: signature, expiry, issuer,
   * audience, revocation, and the admin still existing. The role comes from
   * the database record, not from the token or the request.
   */
  async function authenticate(token) {
    const claims = tokenService.verify(token);
    if (revocationList.isRevoked(claims.jti)) {
      throw new AppError(401, 'TOKEN_REVOKED', 'You have signed out. Please sign in again.');
    }
    const admin = await admins.findById(claims.sub);
    if (!admin) throw invalidTokenError();
    return { admin: toIdentity(admin), tokenId: claims.jti, expiresAt: claims.expiresAt };
  }

  /** Revokes the token if it is still valid; silently ignores bad tokens. */
  function logout(token) {
    if (!token) return false;
    try {
      const claims = tokenService.verify(token);
      revocationList.revoke(claims.jti, claims.expiresAt);
      return true;
    } catch {
      return false;
    }
  }

  return { login, authenticate, logout };
}
