/**
 * Evaluate goals (src/data/goals.json).
 * metric: distance (km) · time (h) · elevation (hm) · count · tss · zone_time (h, zone + basis) · long_rides (count ≥ min_km)
 * period: year · month · week
 */
import { fmtMonthYearShort, fmtDate } from './format.ts';
import { addDays, rideCalendar, startOfDay, weekStart } from '../training/index.ts';
import type { Basis, CalendarRide } from '../training/index.ts';
import { tizTotal } from '../ride/index.ts';
import type { TizRide } from '../ride/index.ts';
import { t } from '../i18n/index.ts';

/** What a goal measures. */
export type GoalMetric = 'distance' | 'time' | 'elevation' | 'count' | 'tss' | 'zone_time' | 'long_rides';
/** The period a goal repeats over. */
export type GoalPeriod = 'year' | 'month' | 'week';

/** A goal (GLOSSARY) as written in goals.json. */
export interface Goal {
  id?: string;
  label?: string;
  metric: GoalMetric;
  period: GoalPeriod;
  /** Target per period in the metric's unit (`UNIT`). */
  target: number;
  /** zone_time: the zone (1-based, default Z2). */
  zone?: number | null;
  /** zone_time: the basis of the TIZ (default power). */
  basis?: Basis | null;
  /** long_rides: minimum distance in km (default 80). */
  min_km?: number | null;
}

/** What a goal reads of a ride: the admission and calendar fields, the measured values and the TIZ. */
export interface GoalRide extends CalendarRide, TizRide {
  /** Metres. */
  distance?: number | null;
  /** Seconds. */
  moving_time?: number | null;
  /** Elevation gain in metres. */
  elev?: number | null;
  tss?: number | null;
}

/** A goal period: from `start` (inclusive) to `end` (exclusive), local midnights. */
export interface GoalPeriodRange {
  start: Date;
  end: Date;
}

/** Evaluation of a goal at a clock. */
export interface GoalEvaluation {
  g: Goal;
  /** The current period. */
  P: GoalPeriodRange;
  /** Value so far in the current period. */
  value: number;
  /** Elapsed share of the period (0.001–1). */
  frac: number;
  /** Value expected by now at an even pace. */
  expected: number;
  /** Projected value at the end of the period; null in the first 3 % of it. */
  projection: number | null;
  /** Previous periods (12 weeks / 6 months / 3 years), oldest first, with their value and whether they hit the target. */
  hist: { start: Date; v: number; hit: boolean }[];
  /** Consecutive periods with the target hit, including the current one once it is hit. */
  streak: number;
  done: boolean;
  /** Value minus expected. */
  ahead: number;
}

export const UNIT: Record<GoalMetric, string> = { distance: 'km', time: 'h', elevation: t('units.elev'), count: '', tss: 'TSS', zone_time: 'h', long_rides: '' };
export const DEC: Record<GoalMetric, number> = { distance: 0, time: 1, elevation: 0, count: 0, tss: 0, zone_time: 1, long_rides: 0 };

function periodOf(period: GoalPeriod, ref: Date): GoalPeriodRange {
  const d = startOfDay(ref);
  if (period === 'year') return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear() + 1, 0, 1) };
  if (period === 'month') return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
  const s = weekStart(d);
  return { start: s, end: addDays(s, 7) };
}
const prevRef = (period: GoalPeriod, start: Date): Date => (period === 'year' ? new Date(start.getFullYear() - 1, 6, 1) : period === 'month' ? new Date(start.getFullYear(), start.getMonth() - 1, 15) : addDays(start, -3));

function valueOf(g: Goal, rides: readonly GoalRide[]): number {
  switch (g.metric) {
    case 'distance': return rides.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
    case 'time': return rides.reduce((s, r) => s + (r.moving_time || 0) / 3600, 0);
    case 'elevation': return rides.reduce((s, r) => s + (r.elev || 0), 0);
    case 'count': return rides.length;
    case 'tss': return rides.reduce((s, r) => s + (r.tss || 0), 0);
    case 'long_rides': return rides.filter((r) => (r.distance || 0) / 1000 >= (g.min_km || 80)).length;
    case 'zone_time': return (tizTotal(rides, g.basis === 'hr' ? 'hr' : 'power').seconds[(g.zone || 2) - 1] || 0) / 3600;
    // An unknown metric in goals.json counts nothing.
    default: return 0;
  }
}

/** A goal at the clock `now`: value, pace and projection in the current period, and its history. Only admitted stat rides count. */
export function evalGoal(g: Goal, allRides: readonly GoalRide[], now: Date = new Date()): GoalEvaluation {
  const { available, end } = rideCalendar(allRides, now);
  const P = periodOf(g.period, end);
  const inP = (p: GoalPeriodRange) => available.filter((r) => r.stats && r.d >= p.start && r.d < p.end);
  const value = valueOf(g, inP(P));
  // A later admitted local calendar day starts a new period, never a negative pace.
  const paceDate = Math.max(+now, +end);
  const frac = Math.min(1, Math.max(0.001, (paceDate - +P.start) / (+P.end - +P.start)));
  const expected = g.target * frac;
  const projection = frac > 0.03 ? value / frac : null;
  // History: last 12 weeks / 6 months / 3 years
  const histN = g.period === 'week' ? 12 : g.period === 'month' ? 6 : 3;
  const hist: GoalEvaluation['hist'] = [];
  let ref = P.start;
  for (let i = 0; i < histN; i++) {
    const p = periodOf(g.period, prevRef(g.period, ref));
    const v = valueOf(g, inP(p));
    hist.unshift({ start: p.start, v, hit: v >= g.target });
    ref = p.start;
  }
  let streak = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i].hit; i--) streak++;
  if (value >= g.target) streak++;
  return { g, P, value, frac, expected, projection, hist, streak, done: value >= g.target, ahead: value - expected };
}

/** Label of a goal period: "2026", "Oct 26", "Wk from 12/10". */
export const fmtP = (g: Pick<Goal, 'period'>, start: Date): string => (g.period === 'year' ? String(start.getFullYear()) : g.period === 'month' ? fmtMonthYearShort(start) : t('goals.weekFrom', { d: fmtDate(start) }));
