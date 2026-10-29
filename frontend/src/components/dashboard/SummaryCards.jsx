import { CircleCheck, CircleDot, Clock, Inbox } from 'lucide-react';

const CARDS = [
  { status: '', label: 'Total inquiries', icon: Inbox, tone: 'total' },
  { status: 'New', label: 'New', icon: CircleDot, tone: 'new' },
  { status: 'In Progress', label: 'In progress', icon: Clock, tone: 'in-progress' },
  { status: 'Resolved', label: 'Resolved', icon: CircleCheck, tone: 'resolved' },
];

const numberFormat = new Intl.NumberFormat();

function percentOf(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/**
 * Totals for all inquiries, computed by the API. Each card is also a quick
 * status filter for the table (pressed = active; "Total" clears it).
 */
export function SummaryCards({ stats, loading, activeStatus, onSelectStatus }) {
  return (
    <ul className="stat-grid" aria-label="Inquiry totals" aria-busy={loading || undefined}>
      {CARDS.map(({ status, label, icon: Icon, tone }) => {
        const value = !stats ? null : status ? (stats.byStatus[status] ?? 0) : stats.total;
        const pressed = activeStatus === status;
        return (
          <li key={label}>
            <button
              type="button"
              className={`stat-card stat-card--${tone}`}
              aria-pressed={pressed}
              onClick={() => onSelectStatus(status)}
            >
              <span className="stat-card__label">
                <Icon className="stat-card__icon" aria-hidden="true" />
                {label}
              </span>
              <span className="stat-card__value">
                {value === null ? '—' : numberFormat.format(value)}
              </span>
              <span className="stat-card__meta">
                {value === null
                  ? 'Loading…'
                  : status
                    ? `${percentOf(value, stats.total)}% of all`
                    : 'All statuses'}
              </span>
              <span className="visually-hidden">
                {status ? `. Show only ${label.toLowerCase()} inquiries` : '. Show every status'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
