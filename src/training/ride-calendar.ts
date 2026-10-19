import { startOfDay } from './calendar-day.ts';

/** What `rideCalendar` reads of a ride: actual start, local start and whether it is a stat ride. */
export interface CalendarRide {
  /** Actual start (Unix ms); null for legacy rides without one – their local start is used instead. */
  start?: number | null;
  /** Local start (ride date and wall-clock time). */
  d: Date;
  /** Stat ride (only those move the calendar end). */
  stats?: boolean | null;
}

/** Admitted rides and the calendar end (GLOSSARY "Calendar end"). */
export interface RideCalendar<R> {
  /** Rides whose actual start is not after `now`, in input order. */
  available: R[];
  /** Calendar end: the later of today and the latest ride date of an admitted stat ride (local midnight). */
  end: Date;
}

/** Actual-start admission and local calendar extent are deliberately separate.
 * Completed rides east of the viewer can belong to tomorrow; E-bikes cannot
 * advance a statistics period. Unknown actual starts retain the legacy fallback.
 */
export function rideCalendar<R extends CalendarRide>(rides: readonly R[], now: Date): RideCalendar<R> {
  const available = rides.filter(r => (r.start ?? +r.d) <= +now);
  let end = startOfDay(now);
  for (const r of available) if (r.stats && r.d > end) end = startOfDay(r.d);
  return { available, end };
}
