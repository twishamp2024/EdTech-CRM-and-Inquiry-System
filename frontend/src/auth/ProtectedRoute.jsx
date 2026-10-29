import { RefreshCw, ServerCrash } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../components/ui/Button.jsx';
import { StatusScreen } from '../components/ui/StatusScreen.jsx';
import { useAuth } from './useAuth.js';

/**
 * Renders admin routes only for a signed-in admin; otherwise redirects to
 * /login and remembers where the user was going.
 *
 * This is a convenience for the interface, not a security boundary: the API
 * authorises every admin request itself (cookie JWT + role check).
 */
export function ProtectedRoute({ children }) {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return <StatusScreen loading title="Checking your session…" />;
  }

  if (status === 'unavailable') {
    return (
      <StatusScreen
        icon={ServerCrash}
        title="We can’t reach the server"
        action={
          <Button onClick={retry} icon={RefreshCw}>
            Try again
          </Button>
        }
      >
        {error?.message ?? 'The API is not responding.'}
      </StatusScreen>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}
