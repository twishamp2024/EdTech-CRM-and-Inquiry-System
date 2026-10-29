import { LoaderCircle } from 'lucide-react';

/** Centered full-area message: loading, empty or error states. */
export function StatusScreen({ loading = false, icon: Icon, title, children, action }) {
  return (
    <section className="status-screen" role={loading ? 'status' : undefined} aria-live="polite">
      {loading ? (
        <LoaderCircle className="status-screen__icon spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="status-screen__icon" aria-hidden="true" />
      )}
      <h1 className="status-screen__title">{title}</h1>
      {children && <p className="status-screen__text">{children}</p>}
      {action && <div className="status-screen__action">{action}</div>}
    </section>
  );
}
