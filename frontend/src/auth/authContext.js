import { createContext } from 'react';

/**
 * status: 'checking' (restoring the session via /api/auth/me) | 'authenticated'
 *       | 'unauthenticated' | 'unavailable' (API unreachable while checking)
 * endReason: why the last session ended — 'expired' (a request came back 401)
 *            or 'signed-out' — so the login page can explain it.
 */
export const AuthContext = createContext(null);
