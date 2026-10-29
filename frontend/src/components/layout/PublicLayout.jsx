import { LogIn } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { Brand } from './Brand.jsx';
import { SkipLink } from './SkipLink.jsx';

export function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <SkipLink />
      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />
          {pathname !== '/login' && (
            <nav aria-label="Account">
              <Link to="/login" className="btn btn--ghost btn--sm">
                <LogIn className="btn__icon" aria-hidden="true" />
                <span>Admin sign in</span>
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">© {new Date().getFullYear()} EdTech CRM</div>
      </footer>
    </div>
  );
}
