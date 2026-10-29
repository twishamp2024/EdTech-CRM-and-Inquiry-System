const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** "30 Oct 2026, 14:05" in the viewer's locale and time zone; null if invalid. */
export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormat.format(date);
}

/** { date: "30 Oct 2026", time: "14:05" } in the viewer's locale; null if invalid. */
export function formatDateParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { date: dateFormat.format(date), time: timeFormat.format(date) };
}

/** A tel: link target: digits with an optional leading +. */
export function telHref(phone) {
  const digits = String(phone).replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}
