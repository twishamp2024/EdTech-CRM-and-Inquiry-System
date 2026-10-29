import { API_BASE_URL } from '../config.js';

// Generous default: Render's free tier can take ~30–60s to wake from sleep.
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Error thrown for every failed API call. `code` mirrors the backend's error codes. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildUrl(path, baseUrl = API_BASE_URL) {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseBody(response) {
  if (response.status === 204) return null;
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * fetch wrapper for the backend API: JSON in and out, optional Bearer token,
 * timeout, and errors normalised to ApiError. Aborting via `signal` rejects
 * with the browser's AbortError so callers can ignore cancelled requests.
 */
export async function apiRequest(
  path,
  { method = 'GET', body, token, signal, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(buildUrl(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new ApiError('The server took too long to respond. Please try again.', {
        code: 'TIMEOUT',
      });
    }
    if (signal?.aborted) throw err;
    throw new ApiError('Unable to reach the server. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  const data = await parseBody(response);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: error?.code ?? 'HTTP_ERROR',
      details: error?.details,
    });
  }
  return data;
}
