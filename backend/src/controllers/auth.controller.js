import { clearAuthCookie, readAuthCookie, setAuthCookie } from '../utils/authCookie.js';

export function createAuthController({ authService, cookie }) {
  return {
    /** POST /api/auth/login — sets the HttpOnly session cookie; the token is never in the body. */
    async login(req, res) {
      const { email, password } = req.validated.body;
      const { admin, token, expiresAt } = await authService.login(email, password);

      setAuthCookie(res, cookie, token, expiresAt);
      res.set('Cache-Control', 'no-store').json({
        success: true,
        message: 'Signed in successfully.',
        data: { admin, expiresAt: expiresAt.toISOString() },
      });
    },

    /** POST /api/auth/logout — revokes the token (if valid) and clears the cookie. Idempotent. */
    logout(req, res) {
      authService.logout(readAuthCookie(req, cookie));
      clearAuthCookie(res, cookie);
      res.set('Cache-Control', 'no-store').json({ success: true, message: 'Signed out.' });
    },

    /** GET /api/auth/me — the identity established by `authenticate`. */
    me(req, res) {
      res.set('Cache-Control', 'no-store').json({
        success: true,
        data: { admin: req.auth.admin, expiresAt: req.auth.expiresAt.toISOString() },
      });
    },
  };
}
