import { LoaderCircle } from 'lucide-react';
import { INQUIRY_STATUSES } from '../../constants/inquiry.js';

const slug = (status) => status.toLowerCase().replace(/\s+/g, '-');

/** Status dropdown for one inquiry; disabled with a spinner while saving. */
export function StatusSelect({ inquiry, value, saving, onChange }) {
  return (
    <div className="status-control">
      <span className={`status-dot status-dot--${slug(value)}`} aria-hidden="true" />
      <select
        className={`input select status-select status-select--${slug(value)}`}
        value={value}
        disabled={saving}
        aria-label={`Status for ${inquiry.name ?? 'this inquiry'}`}
        aria-busy={saving || undefined}
        onChange={(event) => onChange(inquiry, event.target.value)}
      >
        {INQUIRY_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      {saving && <LoaderCircle className="status-control__spinner spin" aria-hidden="true" />}
    </div>
  );
}
