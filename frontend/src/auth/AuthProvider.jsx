import { useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.api.js';
import { setUnauthorizedListener } from '../api/client.js';
import { AuthContext } from './authContext.js';

const signedOutState = (endReason = null) => ({
  status: 'unauthenticated',
  admin: null,
  error: null,
  endReason,
});

/** Outcome of GET /api/auth/me as auth state. Only a 401 means "not signed in". */
async function resolveSession(signal) {
  try {
    const admin = await authApi.fetchCurrentAdmin({ signal });
    return { status: 'authenticated', admin, error: null, endReason: null };
  } catch (error) {
    if (error?.name === 'CanceledError') return null;
    if (error?.status === 401) return signedOutState();
    return { status: 'unavailable', admin: null, error, endReason: null };
  }
}

/**
 * Admin session state for the SPA. The session itself is the API's HttpOnly
 * cookie: this provider never sees or stores the JWT. It only mirrors what
 * the API reports, restoring it on load through GET /api/auth/me.
 *
 * This is for user experience only. Every admin endpoint is authorised by
 * the backend, whatever the frontend believes.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: 'checking',
    admin: null,
    error: null,
    endReason: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    resolveSession(controller.signal).then((next) => next && setState(next));
    return () => controller.abort();
  }, []);

  // Any admin request that returns 401 means the session ended on the server.
  useEffect(() => setUnauthorizedListener(() => setState(signedOutState('expired'))), []);

  const retry = useCallback(async () => {
    setState((current) => ({ ...current, status: 'checking', error: null }));
    const next = await resolveSession();
    if (next) setState(next);
  }, []);

  const login = useCallback(async (credentials) => {
    const admin = await authApi.login(credentials);
    setState({ status: 'authenticated', admin, error: null, endReason: null });
    return admin;
  }, []);

  /** Rejects (and keeps the session) if the API could not be told to sign out. */
  const logout = useCallback(async () => {
    await authApi.logout();
    setState(signedOutState('signed-out'));
  }, []);

  const value = useMemo(() => ({ ...state, login, logout, retry }), [state, login, logout, retry]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
