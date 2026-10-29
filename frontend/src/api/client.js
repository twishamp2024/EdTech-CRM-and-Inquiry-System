import axios from 'axios';
import { API_BASE_URL } from '../config.js';

// Generous default: Render's free tier can take ~30–60 s to wake from sleep.
export const DEFAULT_TIMEOUT_MS = 30_000;

const NETWORK_MESSAGE = 'We could not reach the server. Check your connection and try again.';
const TIMEOUT_MESSAGE = 'The server took too long to respond. Please try again.';

/** Error thrown for every failed API call. `code` mirrors the backend's error codes. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR', details, retryAfterSeconds } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Converts an Axios error into an ApiError; cancellations pass through unchanged. */
export function toApiError(error) {
  if (axios.isCancel(error) || error instanceof ApiError) return error;

  const response = error?.response;
  if (response) {
    // Text responses (such as a failed CSV export) may still carry a JSON envelope.
    const body = typeof response.data === 'string' ? parseJson(response.data) : response.data;
    const envelope = body?.error;
    const retryAfter = Number(response.headers?.['retry-after']);
    return new ApiError(envelope?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: envelope?.code ?? 'HTTP_ERROR',
      details: Array.isArray(envelope?.details) ? envelope.details : undefined,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new ApiError(TIMEOUT_MESSAGE, { code: 'TIMEOUT' });
  }
  return new ApiError(NETWORK_MESSAGE, { code: 'NETWORK_ERROR' });
}

let unauthorizedListener = null;

/**
 * Registers the callback run when an authenticated request comes back 401
 * (expired, revoked or missing session). Returns an unsubscribe function.
 */
export function setUnauthorizedListener(listener) {
  unauthorizedListener = listener;
  return () => {
    if (unauthorizedListener === listener) unauthorizedListener = null;
  };
}

/**
 * Axios instance for the backend API. Admin authentication is an HttpOnly
 * cookie set by the API: `withCredentials` sends it (also needed if the API is
 * ever on another origin), and JavaScript never sees or stores the token.
 * Requests may pass `skipSessionExpiry: true` (login, session check) so their
 * 401s are not treated as "your session ended".
 */
export function createApiClient({
  baseURL = API_BASE_URL,
  timeout = DEFAULT_TIMEOUT_MS,
  adapter,
} = {}) {
  const client = axios.create({
    baseURL,
    timeout,
    withCredentials: true,
    headers: { Accept: 'application/json' },
    ...(adapter && { adapter }),
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const apiError = toApiError(error);
      if (
        apiError instanceof ApiError &&
        apiError.status === 401 &&
        !error.config?.skipSessionExpiry
      ) {
        unauthorizedListener?.(apiError);
      }
      return Promise.reject(apiError);
    },
  );

  return client;
}

export const apiClient = createApiClient();
