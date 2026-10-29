import { useEffect, useState } from 'react';
import { getHealth } from './api/health.api.js';

const STATUS_LABELS = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API unreachable',
};

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();
    getHealth({ signal: controller.signal })
      .then(() => setApiStatus('online'))
      .catch((err) => {
        if (err.name !== 'AbortError') setApiStatus('offline');
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <span className="brand">EdTech CRM</span>
          <span className={`status-pill status-pill--${apiStatus}`} role="status">
            {STATUS_LABELS[apiStatus]}
          </span>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <h1>Inquiry Management System</h1>
          <p>
            The project foundation is running: this React app reaches the Express API through{' '}
            <code>/api</code>.
          </p>
          <p className="muted">
            The public inquiry form and the admin dashboard are built in the next stages.
          </p>
        </section>
      </main>
    </div>
  );
}
