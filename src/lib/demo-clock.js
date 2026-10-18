/**
 * Demo clock: the shipped demo data is generated once, but the dashboard always looks at
 * "today". To keep periods like "last 30 days" populated, demo dates are moved forward in
 * whole weeks (weekdays stay intact) so the newest demo ride falls into the last seven days.
 * Pure, no I/O. Only used while the demo data is active – real data is never shifted.
 */
import { dayOrdinal, ordinalDay } from '../training/index.js';

const DAY = 86400000;

/** Days (multiple of 7, ≥ 0) to add so that `newestDay` ('YYYY-MM-DD') lands in (today − 7, today]. */
export function demoDayShift(newestDay, today) {
  const newest = dayOrdinal(newestDay);
  if (!Number.isFinite(newest)) return 0;
  const behind = dayOrdinal(today) - newest;
  return behind > 0 ? Math.floor(behind / 7) * 7 : 0;
}

/** ISO date or date-time string (optionally with trailing Z) moved by `days` calendar days. */
function shiftISO(value, days) {
  if (typeof value !== 'string') return value;
  const m = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+)?(Z)?$/.exec(value);
  if (!m) return value;
  const day = ordinalDay(dayOrdinal(m[1]) + days);
  return day + (m[2] || '') + (m[3] || '');
}

/** 'YYYY-MM-DD' moved by `days`. */
export const shiftDay = (day, days) => shiftISO(day, days);

/** ISO instant (e.g. the last sync) moved by `days`, never later than `now` (a sync cannot lie in the future). */
export const shiftInstant = (iso, days, now = Date.now()) => (iso ? new Date(Math.min(Date.parse(iso) + days * DAY, now)).toISOString() : iso);

/** Athlete history (fitness-history.json entries) with every `date` moved by `days`. */
export const shiftHistory = (history, days) =>
  (days && Array.isArray(history) ? history.map((x) => (x?.date ? { ...x, date: shiftDay(String(x.date), days) } : x)) : history);

/** Zones file (zones.json) with every dated HR entry moved by `days`. */
export const shiftZonesFile = (file, days) =>
  (days && Array.isArray(file?.heart_rate)
    ? { ...file, heart_rate: file.heart_rate.map((x) => (x?.from ? { ...x, from: shiftDay(String(x.from), days) } : x)) }
    : file);

/** Copy of a ride frontmatter with start instant and local start time moved by `days`. */
export function shiftRideDates(ride, days) {
  if (!days) return ride;
  return { ...ride, start_date: shiftISO(ride.start_date, days), start_date_local: shiftISO(ride.start_date_local, days) };
}
