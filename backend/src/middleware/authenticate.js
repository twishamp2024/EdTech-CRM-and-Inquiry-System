import { AppError } from '../utils/AppError.js';
import { clearAuthCookie, readAuthCookie } from '../utils/authCookie.js';

/**
 * Requires a valid admin session cookie. On success sets
 *   req.auth = { admin: { id, email, role }, tokenId, expiresAt }
 * Missing, malformed, tampered, expired, revoked or orphaned tokens → 401
 * (and the stale cookie is cleared). Only the HttpOnly cookie is read: an
 * Authorization header, or any role/identity sent by the client, is ignored.
 */
export function createAuthenticate({ authService, cookie }) {
  return async function authenticate(req, res, next) {
    const token = readAuthCookie(req, cookie);
    if (!token) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.'));
    }
    try {
      req.auth = await authService.authenticate(token);
      return next();
    } catch (err) {
      if (err instanceof AppError && err.status === 401) clearAuthCookie(res, cookie);
      return next(err);
    }
  };
}

/** 403 unless the authenticated identity (from the server, not the request) has one of `roles`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.'));
    }
    if (!roles.includes(req.auth.admin.role)) {
      return next(
        new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'),
      );
    }
    return next();
  };
}
