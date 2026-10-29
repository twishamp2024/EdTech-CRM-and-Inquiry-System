import { Outlet } from 'react-router';
import { AuthProvider } from './AuthProvider.jsx';

/**
 * Route element wrapping /login and /admin in one AuthProvider: the session
 * survives navigation between them, and the public form never calls
 * GET /api/auth/me.
 */
export function AdminSession() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
