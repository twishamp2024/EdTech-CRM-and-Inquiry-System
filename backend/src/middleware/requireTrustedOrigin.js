import { AppError } from '../utils/AppError.js';
import { readAuthCookie } from '../utils/authCookie.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The request's origin from `Origin`, falling back to the origin of `Referer`. */
export function requestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the request
 * must name an allowed frontend origin. Browsers always send `Origin` on
 * cross-origin requests and on same-origin POST/PATCH/DELETE, and pages cannot
 * forge it. A missing origin is rejected too, so tools such as curl must send
 * `-H "Origin: <frontend URL>"`. Works alongside SameSite=Strict cookies.
 */
export function createRequireTrustedOrigin(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function requireTrustedOrigin(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = requestOrigin(req);
    if (origin && allowed.has(origin)) return next();
    return next(
      new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This request must be sent from the CRM website.'),
    );
  };
}

/**
 * App-wide guard: any unsafe request carrying the session cookie must pass the
 * origin check, including endpoints added later. Requests without the cookie
 * are unaffected (e.g. the public inquiry form called by a script).
 */
export function createSessionCsrfGuard({ allowedOrigins, cookie }) {
  const requireTrustedOrigin = createRequireTrustedOrigin(allowedOrigins);
  return function sessionCsrfGuard(req, res, next) {
    if (!readAuthCookie(req, cookie)) return next();
    return requireTrustedOrigin(req, res, next);
  };
}
