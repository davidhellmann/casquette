/**
 * Demo clock: the shipped demo data is generated once, but the dashboard always looks at
 * "today". To keep periods like "last 30 days" populated, demo dates are moved forward in
 * whole weeks (weekdays stay intact) so the newest demo ride falls into the last seven days.
 * Pure, no I/O. Only used while the demo data is active – real data is never shifted.
 */
import { dayOrdinal, ordinalDay } from '../training/index.ts';

const DAY = 86400000;

/** Days (multiple of 7, ≥ 0) to add so that `newestDay` ('YYYY-MM-DD') lands in (today − 7, today]. */
export function demoDayShift(newestDay: string | null | undefined, today: Date | string): number {
  const newest = dayOrdinal(newestDay);
  if (!Number.isFinite(newest)) return 0;
  const behind = dayOrdinal(today) - newest;
  return behind > 0 ? Math.floor(behind / 7) * 7 : 0;
}

/** ISO date or date-time string (optionally with trailing Z) moved by `days` calendar days. */
function shiftISO<T>(value: T, days: number): T | string {
  if (typeof value !== 'string') return value;
  const m = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+)?(Z)?$/.exec(value);
  if (!m) return value;
  const day = ordinalDay(dayOrdinal(m[1]) + days);
  return day + (m[2] || '') + (m[3] || '');
}

/** 'YYYY-MM-DD' moved by `days`. */
export const shiftDay = (day: string, days: number): string => shiftISO(day, days);

/** ISO instant (e.g. the last sync) moved by `days`, never later than `now` (ms; a sync cannot lie in the future). */
export const shiftInstant = <T extends string | null | undefined>(iso: T, days: number, now: number): T | string => (iso ? new Date(Math.min(Date.parse(iso) + days * DAY, now)).toISOString() : iso);

/** Athlete history (fitness-history.json entries) with every `date` moved by `days`. */
export const shiftHistory = <H extends { date?: unknown }>(history: H[], days: number): H[] =>
  (days && Array.isArray(history) ? history.map((x) => (x?.date ? { ...x, date: shiftDay(String(x.date), days) } : x)) : history);

/** Zones file (zones.json) with every dated HR entry moved by `days`. */
export function shiftZonesFile<F>(file: F, days: number): F {
  if (!days || typeof file !== 'object' || file === null) return file;
  // The zones file is unchecked JSON here (the athlete timeline validates it).
  if (!('heart_rate' in file) || !Array.isArray(file.heart_rate)) return file;
  const shifted = file.heart_rate.map((x: unknown) =>
    (typeof x === 'object' && x !== null && 'from' in x && x.from ? { ...x, from: shiftDay(String(x.from), days) } : x));
  return { ...file, heart_rate: shifted };
}

/** Copy of a ride frontmatter with start instant and local start time moved by `days`. */
export function shiftRideDates<R extends { start_date?: string | null; start_date_local: string }>(ride: R, days: number): R {
  if (!days) return ride;
  return { ...ride, start_date: shiftISO(ride.start_date, days), start_date_local: shiftISO(ride.start_date_local, days) };
}
