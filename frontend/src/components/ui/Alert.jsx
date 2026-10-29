import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

const ICONS = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info };

/**
 * Inline message. Errors use role="alert" (announced immediately); other
 * variants use role="status" (announced politely).
 */
export function Alert({ variant = 'info', title, children, className = '', ...props }) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`alert alert--${variant} ${className}`.trim()}
      {...props}
    >
      <Icon className="alert__icon" aria-hidden="true" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__text">{children}</div>}
      </div>
    </div>
  );
}
