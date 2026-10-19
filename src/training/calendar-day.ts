/**
 * Calendar days: local wall-clock dates, never converted into another time zone (GLOSSARY "Calendar day").
 * The single home of date arithmetic for the domain – day keys, start of day, weeks, day ordinals,
 * the ride date and the year comparison. Pure, no clock, no locale. Display formatting lives in
 * src/scripts/format.ts.
 *
 * Arithmetic on days counts calendar days, never elapsed 24-hour blocks, so a 23- or 25-hour day
 * (daylight saving change) is still one day.
 */
const DAY_MS = 86400000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Anything a calendar day can be read from: a Date (host-local components) or a written
 * 'YYYY-MM-DD…' date/date-time string. Anything else (null, undefined) is an invalid day.
 */
export type CalendarInput = Date | string | null | undefined;
const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar wall time, NOT an instant. Strings retain their written local date/time
 * even with Z/offset; Date objects use host-local components (source zone is lost).
 * Actual start instants must be parsed separately from Strava start_date. */
export function calendarDate(value: CalendarInput): Date {
  if (value instanceof Date) return new Date(value);
  if (typeof value !== 'string') return new Date(NaN);
  const local = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '');
  return new Date(local.length === 10 ? local + 'T00:00:00' : local);
}

/** Day key 'YYYY-MM-DD' of a Date (host-local components) or a written date/date-time string; null if invalid. */
export function calendarDay(value: CalendarInput): string | null {
  const d = value instanceof Date ? value : calendarDate(value);
  return Number.isFinite(+d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;
}

/** Ride date: the calendar day of a ride's written local start time ('YYYY-MM-DD'). */
export const rideDate = (ride: { start_local: CalendarInput }): string | null => calendarDay(ride.start_local);

/** Local midnight at the start of the date's calendar day. */
export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The date moved by `n` calendar days, keeping its wall-clock time. */
export const addDays = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Start of the Monday of the date's week (weeks run Monday to Sunday). */
export const weekStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/**
 * Day ordinal: the calendar day as a whole number (days since 1970-01-01), from a Date (host-local
 * components) or a written 'YYYY-MM-DD…' string. Consecutive calendar days differ by exactly 1; NaN if invalid.
 */
export function dayOrdinal(value: CalendarInput): number {
  if (typeof value === 'string') {
    const m = ISO_DAY.exec(value);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
  }
  const d = calendarDate(value);
  return Number.isFinite(+d) ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS : NaN;
}

/** Day key 'YYYY-MM-DD' of a day ordinal. */
export const ordinalDay = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Calendar days from `a` to `b` (negative if `b` is earlier). */
export const daysBetween = (a: CalendarInput, b: CalendarInput): number => dayOrdinal(b) - dayOrdinal(a);

/** ISO 8601 week number (1–53) of the date's calendar day. */
export function isoWeek(d: Date): number {
  const ordinal = dayOrdinal(d), weekday = (d.getDay() + 6) % 7;
  const thursday = new Date((ordinal - weekday + 3) * DAY_MS);
  return Math.floor((ordinal - weekday + 3 - Date.UTC(thursday.getUTCFullYear(), 0, 1) / DAY_MS) / 7) + 1;
}

/**
 * Position of the date's month and day in a leap reference year: 1 January = 0 … 29 February = 59 …
 * 31 December = 365. Years compare by date, not by ordinal day, so 1 March always lands on 60.
 */
export const yearDayIndex = (d: Date): number => daysBetween(new Date(2024, 0, 1), new Date(2024, d.getMonth(), d.getDate()));

/**
 * "Up to the same day last year": the same month and day one year earlier, at the start of the day.
 * 29 February has no counterpart in a common year and becomes 28 February.
 */
export function sameDayLastYear(d: Date): Date {
  const year = d.getFullYear() - 1, month = d.getMonth();
  return new Date(year, month, Math.min(d.getDate(), new Date(year, month + 1, 0).getDate()));
}
