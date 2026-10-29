import { ApiError } from '../api/client.js';

function retryHint(error) {
  const minutes = error.retryAfterSeconds
    ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60))
    : null;
  return minutes
    ? ` Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
    : ' Please try again later.';
}

/**
 * A message for the person using the form. `context` tunes wording for
 * "inquiry" (public form) and "login" (admin sign-in).
 */
export function describeApiError(error, context) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';

  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return error.message;
    case 'VALIDATION_ERROR':
      return 'Some fields need attention. Please correct them and try again.';
    case 'RATE_LIMITED':
      return context === 'login'
        ? `Too many sign-in attempts.${retryHint(error)}`
        : `Too many inquiries have been sent from this network.${retryHint(error)}`;
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password.';
    case 'ORIGIN_NOT_ALLOWED':
      return 'The server did not accept requests from this site. Ask the administrator to add this address to FRONTEND_URL.';
    case 'UNCONFIRMED':
      return error.message;
    default:
      if (error.status >= 500 || error.status === 0) {
        return context === 'inquiry'
          ? 'We could not save your inquiry right now, so nothing was submitted. Please try again in a moment.'
          : 'The server could not complete the request. Please try again in a moment.';
      }
      return error.message;
  }
}

/**
 * Applies backend field errors (`details: [{ field, message }]`) to a React
 * Hook Form instance. Returns the first field marked (or null) so the caller
 * can focus it once the form is enabled again.
 */
export function applyServerFieldErrors(error, setError, fields) {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null;
  let first = null;
  for (const detail of error.details ?? []) {
    if (detail.field && fields.includes(detail.field)) {
      setError(detail.field, { type: 'server', message: detail.message });
      first ??= detail.field;
    }
  }
  return first;
}
