import { AppError } from '../utils/AppError.js';

/** Rejects requests whose body is not declared as JSON (form posts, text/plain, …). */
export function requireJson(req, _res, next) {
  if (req.is('application/json')) return next();
  return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
}
