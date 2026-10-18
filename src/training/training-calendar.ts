// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Training calendar: stat rides laid out per calendar day, week by week, with an intensity level per
 * ride day and the streaks. One rule for the dashboard calendar (last 52 weeks, by load) and the
 * year review calendar (one year, by kilometres). Pure, no clock, no I/O.
 */
import { addDays, calendarDay, startOfDay, weekStart } from './calendar-day.ts';

/** What colours a ride day: its summed load or kilometres. */
const MEASURES = {
  load: (r) => r.load || 0,
  km: (r) => (r.distance || 0) / 1000,
};

const startOf = (r) => r.start ?? +r.d;

/**
 * @param rides stat rides (`d`, `start`, `distance`, `moving_time`, `load` …) in any order
 * @param opts.from first calendar day of the calendar (Date)
 * @param opts.to last calendar day of the calendar (Date)
 * @param opts.today last calendar day that can hold rides; later days are `future` (default: `to`)
 * @param opts.measure 'load' | 'km' – what decides the level of a ride day
 * @returns {{
 *   days: Record<string, { d: Date, rides: object[], latest: object, n: number, value: number, sec: number }>,
 *   cells: { d: Date, key: string, week: number, day: object|undefined, level: number, outside: boolean, future: boolean }[],
 *   weeks: number, activeDays: number, longestStreak: number, currentStreak: number, weekStreak: number
 * }}
 * `days`: ride days from `from` to the earlier of `to` and `today`; rides of a day in chronological order,
 *   `latest` = the day's most recent ride (the cell's link; several rides also get a menu).
 * `cells`: every day of the whole weeks (Monday–Sunday) covering `from`–`to`; `outside` = not in `from`–`to`.
 * Level 0 = no ride; ride days 1–4 by the quartiles of the positive day values (a day with 0 is level 1).
 * Streaks count consecutive ride days in the calendar: the longest and the current one
 * (ending today, or yesterday if today has no ride yet). `weekStreak`: consecutive weeks with a ride up to
 * this or last week, over all given rides.
 */
export function trainingCalendar(rides, { from, to, today = to, measure }) {
  const valueOf = MEASURES[measure];
  if (!valueOf) throw new RangeError(`Unknown training calendar measure: ${measure}`);
  const first = startOfDay(from), last = startOfDay(today < to ? today : to);
  const lastKey = calendarDay(last), firstKey = calendarDay(first);
  const days = {};
  for (const r of rides.slice().sort((a, b) => startOf(a) - startOf(b))) {
    const key = calendarDay(r.d);
    if (key < firstKey || key > lastKey) continue;
    const day = days[key] ||= { d: startOfDay(r.d), rides: [], n: 0, value: 0, sec: 0 };
    day.rides.push(r); day.latest = r; day.n++; day.value += valueOf(r); day.sec += r.moving_time || 0;
  }

  const values = Object.values(days).map((o) => o.value).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => (values.length ? values[Math.floor((values.length - 1) * p)] : 0);
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 || v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);

  const toKey = calendarDay(to), cells = [];
  const gridEnd = addDays(weekStart(to), 6);
  for (let d = weekStart(first), i = 0; d <= gridEnd; d = addDays(d, 1), i++) {
    const key = calendarDay(d), day = days[key];
    cells.push({ d, key, week: Math.floor(i / 7), day, level: day ? level(day.value) : 0,
      outside: key < firstKey || key > toKey, future: key > lastKey });
  }

  let longestStreak = 0, run = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (days[calendarDay(d)]) longestStreak = Math.max(longestStreak, ++run); else run = 0;
  }
  let currentStreak = 0, d = days[lastKey] ? last : addDays(last, -1);
  while (days[calendarDay(d)]) { currentStreak++; d = addDays(d, -1); }
  const rideWeeks = new Set(rides.map((r) => calendarDay(weekStart(r.d))));
  let weekStreak = 0, w = weekStart(last);
  if (!rideWeeks.has(calendarDay(w))) w = addDays(w, -7);
  while (rideWeeks.has(calendarDay(w))) { weekStreak++; w = addDays(w, -7); }

  return { days, cells, weeks: cells.length / 7, activeDays: Object.keys(days).length,
    longestStreak, currentStreak, weekStreak };
}

/** Totals per calendar year with at least one ride, oldest first: `{ year, n, km, h, elev }`. */
export function yearTotals(rides) {
  const by = new Map();
  for (const r of rides) {
    const y = r.d.getFullYear(), o = by.get(y) || by.set(y, { year: y, n: 0, km: 0, h: 0, elev: 0 }).get(y);
    o.n++; o.km += (r.distance || 0) / 1000; o.h += r.h; o.elev += r.elev || 0;
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}
