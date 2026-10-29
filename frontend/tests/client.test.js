import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiClient,
  createApiClient,
  setUnauthorizedListener,
} from '../src/api/client.js';
import { submitInquiry } from '../src/api/inquiries.api.js';

/** Axios adapter that answers like the network would. */
function respond(status, data, headers = {}) {
  return vi.fn(async (config) => {
    const response = { data, status, statusText: String(status), headers, config, request: {} };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      config,
      {},
      response,
    );
  });
}

const fail = (code) =>
  vi.fn(async (config) => {
    throw new AxiosError('failed', code, config, {});
  });

afterEach(() => setUnauthorizedListener(null));

describe('createApiClient', () => {
  it('targets the configured base URL and always sends credentials (HttpOnly cookie)', async () => {
    const adapter = respond(200, { ok: true });
    const client = createApiClient({ adapter });
    const res = await client.get('/inquiries');

    const config = adapter.mock.calls[0][0];
    expect(config.baseURL).toBe('/api');
    expect(config.url).toBe('/inquiries');
    expect(config.withCredentials).toBe(true);
    expect(config.headers.Accept).toBe('application/json');
    expect(config.headers.Authorization).toBeUndefined();
    expect(res.data).toEqual({ ok: true });
  });

  it('turns the backend error envelope into an ApiError', async () => {
    const client = createApiClient({
      adapter: respond(
        429,
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Slow down', details: [{ message: 'x' }] },
        },
        { 'retry-after': '120' },
      ),
    });
    const error = await client.post('/inquiries', {}).catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Slow down',
      details: [{ message: 'x' }],
      retryAfterSeconds: 120,
    });
  });

  it('reads the error envelope from text responses (e.g. a failed CSV export)', async () => {
    const client = createApiClient({
      adapter: respond(
        422,
        JSON.stringify({
          success: false,
          error: { code: 'EXPORT_TOO_LARGE', message: 'Too many' },
        }),
      ),
    });
    await expect(client.get('/inquiries/export', { responseType: 'text' })).rejects.toMatchObject({
      status: 422,
      code: 'EXPORT_TOO_LARGE',
      message: 'Too many',
    });
  });

  it('handles error responses without an envelope', async () => {
    const client = createApiClient({ adapter: respond(502, '<html>Bad gateway</html>') });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('reports network failures and timeouts in plain language', async () => {
    await expect(createApiClient({ adapter: fail('ERR_NETWORK') }).get('/x')).rejects.toMatchObject(
      {
        code: 'NETWORK_ERROR',
        status: 0,
        message: expect.stringContaining('could not reach the server'),
      },
    );
    await expect(
      createApiClient({ adapter: fail('ECONNABORTED') }).get('/x'),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('lets cancellations through untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await createApiClient({ adapter: respond(200, {}) })
      .get('/x', { signal: controller.signal })
      .catch((err) => err);
    expect(error.name).toBe('CanceledError');
  });

  it('notifies the session listener on 401, unless the request opts out', async () => {
    const listener = vi.fn();
    setUnauthorizedListener(listener);
    const client = createApiClient({ adapter: respond(401, { error: { code: 'TOKEN_EXPIRED' } }) });

    await client.get('/inquiries').catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    await client.get('/auth/me', { skipSessionExpiry: true }).catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('submitInquiry', () => {
  it('returns the stored id only when the backend confirms', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: 'ok', data: { id: 'abc-123', duplicate: false } },
    });
    await expect(submitInquiry({})).resolves.toEqual({
      id: 'abc-123',
      duplicate: false,
      message: 'ok',
    });
  });

  it.each([[{ success: true, data: {} }], [{ success: false, data: { id: 'abc' } }], [{}], ['']])(
    'rejects an unconfirmed response %j',
    async (data) => {
      vi.spyOn(apiClient, 'post').mockResolvedValue({ data });
      await expect(submitInquiry({})).rejects.toMatchObject({ code: 'UNCONFIRMED' });
    },
  );
});
