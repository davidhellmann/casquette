/** Calendar wall time, NOT an instant. Strings retain their written local date/time
 * even with Z/offset; Date objects use host-local components (source zone is lost).
 * Actual start instants must be parsed separately from Strava start_date. */
export function calendarDate(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value !== 'string') return new Date(NaN);
  const local = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '');
  return new Date(local.length === 10 ? local + 'T00:00:00' : local);
}

export function calendarDay(value) {
  const d = calendarDate(value);
  return Number.isFinite(+d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
}
