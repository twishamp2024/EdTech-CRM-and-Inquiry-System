import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/**
 * Per-client-IP limiter that reports through the central error handler.
 * Uses the in-memory store: correct for a single API instance; a shared
 * store (e.g. Redis) is needed if the API is scaled horizontally.
 * Client IPs are only accurate behind a proxy when TRUST_PROXY is set.
 */
function createRateLimiter({ max, windowMs, identifier, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier,
    skipSuccessfulRequests,
    handler: (req, res, next) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      next(
        new AppError(429, 'RATE_LIMITED', message, {
          details: [
            { message: `Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).` },
          ],
        }),
      );
    },
  });
}

/** Public inquiry submissions. Every attempt counts, including invalid ones. */
export function createInquirySubmissionLimiter({ max, windowMs }) {
  return createRateLimiter({
    max,
    windowMs,
    identifier: 'inquiry-submissions',
    message: 'Too many inquiries have been sent from this network. Please try again later.',
  });
}

/**
 * Admin login. Only failed attempts count (successful logins are skipped), so
 * an admin is not locked out by their own sign-ins while guessing is capped.
 */
export function createLoginLimiter({ max, windowMs }) {
  return createRateLimiter({
    max,
    windowMs,
    identifier: 'admin-login',
    message: 'Too many sign-in attempts. Please wait before trying again.',
    skipSuccessfulRequests: true,
  });
}
