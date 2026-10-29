import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '../../auth/useAuth.js';
import { describeApiError } from '../../lib/apiErrors.js';
import { Alert } from '../ui/Alert.jsx';
import { Button } from '../ui/Button.jsx';
import { Brand } from './Brand.jsx';
import { SkipLink } from './SkipLink.jsx';

export function AdminLayout() {
  const { admin, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      // Clearing the auth state makes ProtectedRoute redirect to /login,
      // which then shows "You have signed out".
      await logout();
    } catch (err) {
      // The session is still valid on the server, so stay signed in and say so.
      setError(describeApiError(err, 'logout'));
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <SkipLink />
      <header className="site-header">
        <div className="container site-header__inner">
          <Brand to="/admin/dashboard" badge="Admin" />
          <div className="site-header__account">
            <p className="session-indicator" title={admin?.email}>
              <span className="session-indicator__dot" aria-hidden="true" />
              <span className="visually-hidden">Signed in as </span>
              <span className="site-header__email">{admin?.email}</span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={LogOut}
              onClick={handleSignOut}
              loading={signingOut}
              loadingText="Signing out…"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="site-main">
        {error && (
          <div className="container">
            <Alert variant="error" title="You are still signed in" className="page-alert">
              {error}
            </Alert>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
