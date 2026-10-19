/**
 * Training calendar: stat rides laid out per calendar day, week by week, with an intensity level per
 * ride day and the streaks. One rule for the dashboard calendar (last 52 weeks, by load) and the
 * year review calendar (one year, by kilometres). Pure, no clock, no I/O.
 */
import { addDays, calendarDay, startOfDay, weekStart } from './calendar-day.ts';

/** What the training calendar reads of a ride. */
export interface TrainingCalendarRide {
  /** Local start. */
  d: Date;
  /** Actual start (Unix ms), null for legacy rides – then the local start orders the day's rides. */
  start?: number | null;
  /** Metres. */
  distance?: number | null;
  /** Seconds. */
  moving_time?: number | null;
  load?: number | null;
}

/** What decides the level of a ride day: its summed load or kilometres. */
export type TrainingCalendarMeasure = 'load' | 'km';

/** A ride day of the training calendar. */
export interface TrainingCalendarDay<R> {
  /** Local midnight of the day. */
  d: Date;
  /** The day's rides in chronological order. */
  rides: R[];
  /** The day's most recent ride (the cell's link; several rides also get a menu). */
  latest: R;
  /** Number of rides. */
  n: number;
  /** Summed measure (load or km). */
  value: number;
  /** Summed moving time in seconds. */
  sec: number;
}

/** Intensity level of a cell: 0 = no ride, ride days 1–4 by the quartiles of the positive day values. */
export type TrainingCalendarLevel = 0 | 1 | 2 | 3 | 4;

/** One calendar day of the grid. */
export interface TrainingCalendarCell<R> {
  d: Date;
  /** Calendar day 'YYYY-MM-DD'. */
  key: string;
  /** Week index from 0 (the grid's first week). */
  week: number;
  day: TrainingCalendarDay<R> | undefined;
  level: TrainingCalendarLevel;
  /** Not in `from`–`to` (padding to whole weeks). */
  outside: boolean;
  /** After `today`. */
  future: boolean;
}

/** Training calendar result (GLOSSARY "Training calendar"). */
export interface TrainingCalendar<R> {
  /** Ride days by calendar day 'YYYY-MM-DD', from `from` to the earlier of `to` and `today`. */
  days: Record<string, TrainingCalendarDay<R>>;
  /** Every day of the whole weeks (Monday–Sunday) covering `from`–`to`. */
  cells: TrainingCalendarCell<R>[];
  /** Number of weeks in the grid. */
  weeks: number;
  activeDays: number;
  /** Longest run of consecutive ride days in the calendar. */
  longestStreak: number;
  /** Consecutive ride days ending today, or yesterday if today has no ride yet. */
  currentStreak: number;
  /** Consecutive weeks with a ride up to this or last week, over all given rides. */
  weekStreak: number;
}

/** Options of `trainingCalendar`; all dates must be valid. */
export interface TrainingCalendarOptions {
  /** First calendar day of the calendar. */
  from: Date;
  /** Last calendar day of the calendar. */
  to: Date;
  /** Last calendar day that can hold rides; later days are `future` (default: `to`). */
  today?: Date;
  measure: TrainingCalendarMeasure;
}

/** Totals of one calendar year. */
export interface YearTotal {
  year: number;
  /** Rides. */
  n: number;
  km: number;
  /** Hours. */
  h: number;
  /** Elevation gain in metres. */
  elev: number;
}

/** What colours a ride day: its summed load or kilometres. */
const MEASURES: Record<TrainingCalendarMeasure, (r: TrainingCalendarRide) => number> = {
  load: (r) => r.load || 0,
  km: (r) => (r.distance || 0) / 1000,
};

const startOf = (r: TrainingCalendarRide): number => r.start ?? +r.d;

/** Calendar day of a grid date; the bounds must be valid Dates, so '' only stands in for an invalid one. */
const dayKey = (d: Date): string => calendarDay(d) ?? '';

/**
 * Stat rides in any order → ride days, the grid of cells and the streaks.
 * Level 0 = no ride; ride days 1–4 by the quartiles of the positive day values (a day with 0 is level 1).
 * Streaks count consecutive ride days in the calendar.
 */
export function trainingCalendar<R extends TrainingCalendarRide>(
  rides: readonly R[], { from, to, today = to, measure }: TrainingCalendarOptions,
): TrainingCalendar<R> {
  const valueOf: ((r: TrainingCalendarRide) => number) | undefined = MEASURES[measure];
  if (!valueOf) throw new RangeError(`Unknown training calendar measure: ${measure}`);
  const first = startOfDay(from), last = startOfDay(today < to ? today : to);
  const lastKey = dayKey(last), firstKey = dayKey(first);
  const days: Record<string, TrainingCalendarDay<R>> = {};
  for (const r of rides.slice().sort((a, b) => startOf(a) - startOf(b))) {
    const key = calendarDay(r.d);
    // A ride without a valid ride date has no day in the calendar.
    if (key === null || key < firstKey || key > lastKey) continue;
    const day = days[key];
    if (day) { day.rides.push(r); day.latest = r; day.n++; day.value += valueOf(r); day.sec += r.moving_time || 0; }
    else days[key] = { d: startOfDay(r.d), rides: [r], latest: r, n: 1, value: 0 + valueOf(r), sec: 0 + (r.moving_time || 0) };
  }

  const values = Object.values(days).map((o) => o.value).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => (values.length ? values[Math.floor((values.length - 1) * p)] : 0);
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const level = (v: number): TrainingCalendarLevel => (v <= 0 || v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);

  const toKey = dayKey(to), cells: TrainingCalendarCell<R>[] = [];
  const gridEnd = addDays(weekStart(to), 6);
  for (let d = weekStart(first), i = 0; d <= gridEnd; d = addDays(d, 1), i++) {
    const key = dayKey(d), day = days[key];
    cells.push({ d, key, week: Math.floor(i / 7), day, level: day ? level(day.value) : 0,
      outside: key < firstKey || key > toKey, future: key > lastKey });
  }

  let longestStreak = 0, run = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (days[dayKey(d)]) longestStreak = Math.max(longestStreak, ++run); else run = 0;
  }
  let currentStreak = 0, d = days[lastKey] ? last : addDays(last, -1);
  while (days[dayKey(d)]) { currentStreak++; d = addDays(d, -1); }
  const rideWeeks = new Set(rides.map((r) => calendarDay(weekStart(r.d))));
  let weekStreak = 0, w = weekStart(last);
  if (!rideWeeks.has(dayKey(w))) w = addDays(w, -7);
  while (rideWeeks.has(dayKey(w))) { weekStreak++; w = addDays(w, -7); }

  return { days, cells, weeks: cells.length / 7, activeDays: Object.keys(days).length,
    longestStreak, currentStreak, weekStreak };
}

/** Totals per calendar year with at least one ride, oldest first. */
export function yearTotals(rides: readonly { d: Date; distance?: number | null; h: number; elev?: number | null }[]): YearTotal[] {
  const by = new Map<number, YearTotal>();
  for (const r of rides) {
    const y = r.d.getFullYear();
    let o = by.get(y);
    if (!o) by.set(y, o = { year: y, n: 0, km: 0, h: 0, elev: 0 });
    o.n++; o.km += (r.distance || 0) / 1000; o.h += r.h; o.elev += r.elev || 0;
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}
