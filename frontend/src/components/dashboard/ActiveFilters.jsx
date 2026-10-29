import { X } from 'lucide-react';

const LABELS = { search: 'Search', category: 'Category', userType: 'User type', status: 'Status' };

/** Chips for the filters in effect, each removable, plus "Clear all". */
export function ActiveFilters({ query, onRemove, onClearAll }) {
  const active = Object.keys(LABELS).filter((key) => query[key]);
  if (active.length === 0) return null;
  return (
    <div className="active-filters">
      <p className="active-filters__label" id="active-filters-label">
        Filtered by
      </p>
      <ul className="active-filters__list" aria-labelledby="active-filters-label">
        {active.map((key) => {
          const text = `${LABELS[key]}: ${key === 'search' ? `“${query[key]}”` : query[key]}`;
          return (
            <li key={key} className="chip">
              <span>{text}</span>
              <button
                type="button"
                className="chip__remove"
                onClick={() => onRemove(key)}
                aria-label={`Remove filter ${text}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {active.length > 1 && (
        <button type="button" className="link-button" onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  );
}
