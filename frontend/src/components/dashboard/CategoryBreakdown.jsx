import { CATEGORIES } from '../../constants/inquiry.js';

/**
 * Horizontal bar chart of inquiries per category (one series, one hue).
 * Each bar's count and share are printed beside it, so the chart reads as a
 * table without hovering; each row is also a quick category filter.
 */
export function CategoryBreakdown({ stats, activeCategory, onSelectCategory }) {
  if (!stats) return null;
  const max = Math.max(1, ...CATEGORIES.map((category) => stats.byCategory[category] ?? 0));

  return (
    <figure className="breakdown" aria-labelledby="breakdown-title">
      <figcaption id="breakdown-title" className="breakdown__title">
        Inquiries by category
      </figcaption>
      <ul className="breakdown__list">
        {CATEGORIES.map((category) => {
          const count = stats.byCategory[category] ?? 0;
          const share = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          const pressed = activeCategory === category;
          return (
            <li key={category}>
              <button
                type="button"
                className="breakdown__row"
                aria-pressed={pressed}
                onClick={() => onSelectCategory(pressed ? '' : category)}
              >
                <span className="breakdown__label">{category}</span>
                <span className="breakdown__track" aria-hidden="true">
                  <span
                    className="breakdown__bar"
                    style={{ width: count === 0 ? '0' : `max(4px, ${(count / max) * 100}%)` }}
                  />
                </span>
                <span className="breakdown__value">
                  {count}
                  <span className="breakdown__share"> · {share}%</span>
                </span>
                <span className="visually-hidden">
                  {pressed ? '. Selected, press to show all categories' : `. Show only ${category}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
