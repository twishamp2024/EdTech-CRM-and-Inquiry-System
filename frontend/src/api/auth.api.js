import { ApiError, apiClient } from './client.js';

function adminFrom(data) {
  const admin = data?.data?.admin;
  if (data?.success !== true || !admin?.id) {
    throw new ApiError('Unexpected response from the server.', { code: 'BAD_RESPONSE' });
  }
  return admin;
}

/** POST /api/auth/login — the API sets the HttpOnly session cookie. */
export async function login({ email, password }) {
  const { data } = await apiClient.post(
    '/auth/login',
    { email, password },
    { skipSessionExpiry: true },
  );
  return adminFrom(data);
}

/** GET /api/auth/me — the admin for the current session cookie (401 when none). */
export async function fetchCurrentAdmin({ signal } = {}) {
  const { data } = await apiClient.get('/auth/me', { signal, skipSessionExpiry: true });
  return adminFrom(data);
}

/** POST /api/auth/logout — the API revokes the token and clears the cookie. */
export async function logout() {
  await apiClient.post('/auth/logout', null, { skipSessionExpiry: true });
}
