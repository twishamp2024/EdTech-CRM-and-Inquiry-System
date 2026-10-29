import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CATEGORIES, INQUIRY_STATUSES, USER_TYPES } from '../constants/inquiry.js';

export const PAGE_SIZE = 20;
export const SORTABLE_COLUMNS = Object.freeze(['createdAt', 'name']);
const DEFAULTS = Object.freeze({ page: 1, sortBy: 'createdAt', sortDir: 'desc' });
export const FILTER_KEYS = Object.freeze(['search', 'category', 'userType', 'status']);

/**
 * Reads the dashboard's view (filters, search, sort, page) from the URL, so
 * it survives reloads and can be shared or bookmarked. Unknown or invalid
 * values in the URL are ignored rather than sent to the API.
 */
export function parseInquiryQuery(params) {
  const category = params.get('category');
  const userType = params.get('userType');
  const status = params.get('status');
  const search = (params.get('search') ?? '').trim().slice(0, 100);
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const sortBy = params.get('sortBy');
  const sortDir = params.get('sortDir');
  return {
    search,
    category: CATEGORIES.includes(category) ? category : '',
    userType: USER_TYPES.includes(userType) ? userType : '',
    status: INQUIRY_STATUSES.includes(status) ? status : '',
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULTS.page,
    sortBy: SORTABLE_COLUMNS.includes(sortBy) ? sortBy : DEFAULTS.sortBy,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULTS.sortDir,
  };
}

export function useInquiryQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseInquiryQuery(params), [params]);
  const hasFilters = FILTER_KEYS.some((key) => query[key] !== '');

  /**
   * Applies changes to the URL. Any change other than `page` returns to page
   * 1, so a filter never leaves the user on a page that no longer exists.
   */
  const update = useCallback(
    (changes, { replace = false } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === '' || value === null || value === undefined || value === DEFAULTS[key]) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          if (!('page' in changes)) next.delete('page');
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const resetFilters = useCallback(() => {
    update({ search: '', category: '', userType: '', status: '' });
  }, [update]);

  return { query, hasFilters, update, resetFilters };
}
