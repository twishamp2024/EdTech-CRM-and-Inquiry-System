import { Compass, House } from 'lucide-react';
import { Link } from 'react-router';
import { StatusScreen } from '../components/ui/StatusScreen.jsx';

export function NotFoundPage() {
  return (
    <StatusScreen
      icon={Compass}
      title="Page not found"
      action={
        <Link to="/" className="btn btn--primary btn--md">
          <House className="btn__icon" aria-hidden="true" />
          <span>Go to the inquiry form</span>
        </Link>
      }
    >
      The page you are looking for does not exist or has moved.
    </StatusScreen>
  );
}
