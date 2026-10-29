import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router';

export function Brand({ to = '/', badge }) {
  return (
    <Link to={to} className="brand">
      <GraduationCap className="brand__icon" aria-hidden="true" />
      <span className="brand__name">EdTech CRM</span>
      {badge && <span className="brand__badge">{badge}</span>}
    </Link>
  );
}
