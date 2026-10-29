import { toCsv } from './csv.js';

/**
 * Columns of the admin CSV export. Only inquiry data: there is no admin,
 * password, token or configuration field anywhere in an inquiry row.
 */
export const INQUIRY_EXPORT_COLUMNS = Object.freeze([
  { header: 'Name', value: (row) => row.name },
  { header: 'Phone', value: (row) => row.phone },
  { header: 'Email', value: (row) => row.email },
  { header: 'User Type', value: (row) => row.userType },
  { header: 'Category', value: (row) => row.category },
  { header: 'Status', value: (row) => row.status },
  { header: 'Submitted (UTC)', value: (row) => row.createdAt },
  { header: 'Last updated (UTC)', value: (row) => row.updatedAt },
  { header: 'Message', value: (row) => row.message },
  { header: 'Reference ID', value: (row) => row.id },
]);

/** The model attributes the export reads (and nothing else). */
export const INQUIRY_EXPORT_ATTRIBUTES = Object.freeze([
  'id',
  'name',
  'phone',
  'email',
  'userType',
  'category',
  'status',
  'createdAt',
  'updatedAt',
  'message',
]);

export function inquiriesToCsv(rows) {
  return toCsv(INQUIRY_EXPORT_COLUMNS, rows);
}

export function exportFilename(now = new Date()) {
  return `inquiries-${now.toISOString().slice(0, 10)}.csv`;
}
