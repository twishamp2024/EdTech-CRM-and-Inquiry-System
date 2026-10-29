import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button.jsx';

/** Previous / next controls with the current position. */
export function Pagination({
  page,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  onPageChange,
  disabled,
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        icon={ChevronLeft}
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || !hasPreviousPage}
      >
        Previous
      </Button>
      <p className="pagination__status" aria-current="page">
        Page {page} of {totalPages}
      </p>
      <Button
        variant="secondary"
        size="sm"
        iconEnd={ChevronRight}
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || !hasNextPage}
      >
        Next
      </Button>
    </nav>
  );
}
