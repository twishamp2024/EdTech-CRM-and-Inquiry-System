import { RotateCcw, Search } from 'lucide-react';
import { CATEGORIES, USER_TYPES } from '../../constants/inquiry.js';
import { Button } from '../ui/Button.jsx';

/** Search box, Category and User Type filters, and a reset button. */
export function DashboardToolbar({
  searchText,
  onSearchTextChange,
  category,
  onCategoryChange,
  userType,
  onUserTypeChange,
  hasFilters,
  onReset,
}) {
  return (
    <form
      className="toolbar"
      role="search"
      aria-label="Filter inquiries"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="toolbar__field toolbar__field--search">
        <label htmlFor="inquiry-search" className="field__label">
          Search
        </label>
        <div className="input-with-icon">
          <Search className="input-with-icon__icon" aria-hidden="true" />
          <input
            id="inquiry-search"
            className="input input-with-icon__input"
            type="search"
            placeholder="Name or phone number"
            value={searchText}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => onSearchTextChange(event.target.value)}
            aria-describedby="inquiry-search-hint"
          />
        </div>
        <p id="inquiry-search-hint" className="visually-hidden">
          Results update as you type. Phone numbers match with or without spaces and dashes.
        </p>
      </div>

      <div className="toolbar__field">
        <label htmlFor="filter-category" className="field__label">
          Category
        </label>
        <select
          id="filter-category"
          className="input select"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar__field">
        <label htmlFor="filter-user-type" className="field__label">
          User type
        </label>
        <select
          id="filter-user-type"
          className="input select"
          value={userType}
          onChange={(event) => onUserTypeChange(event.target.value)}
        >
          <option value="">All user types</option>
          {USER_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar__actions">
        <Button variant="secondary" icon={RotateCcw} onClick={onReset} disabled={!hasFilters}>
          Reset filters
        </Button>
      </div>
    </form>
  );
}
