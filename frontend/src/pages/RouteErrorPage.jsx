import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { StatusScreen } from '../components/ui/StatusScreen.jsx';

/** Shown if a page throws while rendering. Details stay in the console. */
export function RouteErrorPage() {
  return (
    <main id="main" className="site-main">
      <StatusScreen
        icon={TriangleAlert}
        title="Something went wrong"
        action={
          <Button icon={RefreshCw} onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        }
      >
        An unexpected error occurred while showing this page.
      </StatusScreen>
    </main>
  );
}
