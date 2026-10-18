// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Evaluate goals (src/data/goals.json).
 * metric: distance (km) · time (h) · elevation (hm) · count · tss · zone_time (h, zone + basis) · long_rides (count ≥ min_km)
 * period: year · month · week
 */
import { fmtMonthYearShort, fmtDate } from './format.ts';
import { addDays, rideCalendar, startOfDay, weekStart } from '../training/index.ts';
import { tizTotal } from '../ride/index.ts';
import { t } from '../i18n/index.ts';

export const UNIT = { distance: 'km', time: 'h', elevation: t('units.elev'), count: '', tss: 'TSS', zone_time: 'h', long_rides: '' };
export const DEC = { distance: 0, time: 1, elevation: 0, count: 0, tss: 0, zone_time: 1, long_rides: 0 };

function periodOf(period, ref) {
  const d = startOfDay(ref);
  if (period === 'year') return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear() + 1, 0, 1) };
  if (period === 'month') return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
  const s = weekStart(d);
  return { start: s, end: addDays(s, 7) };
}
const prevRef = (period, start) => (period === 'year' ? new Date(start.getFullYear() - 1, 6, 1) : period === 'month' ? new Date(start.getFullYear(), start.getMonth() - 1, 15) : addDays(start, -3));

function valueOf(g, rides) {
  switch (g.metric) {
    case 'distance': return rides.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
    case 'time': return rides.reduce((s, r) => s + (r.moving_time || 0) / 3600, 0);
    case 'elevation': return rides.reduce((s, r) => s + (r.elev || 0), 0);
    case 'count': return rides.length;
    case 'tss': return rides.reduce((s, r) => s + (r.tss || 0), 0);
    case 'long_rides': return rides.filter((r) => (r.distance || 0) / 1000 >= (g.min_km || 80)).length;
    case 'zone_time': return (tizTotal(rides, g.basis === 'hr' ? 'hr' : 'power').seconds[(g.zone || 2) - 1] || 0) / 3600;
    default: return 0;
  }
}

export function evalGoal(g, allRides, now = new Date()) {
  const { available, end } = rideCalendar(allRides, now);
  const P = periodOf(g.period, end);
  const inP = (p) => available.filter((r) => r.stats && r.d >= p.start && r.d < p.end);
  const value = valueOf(g, inP(P));
  // A later admitted local calendar day starts a new period, never a negative pace.
  const paceDate = Math.max(+now, +end);
  const frac = Math.min(1, Math.max(0.001, (paceDate - P.start) / (P.end - P.start)));
  const expected = g.target * frac;
  const projection = frac > 0.03 ? value / frac : null;
  // History: last 12 weeks / 6 months / 3 years
  const histN = g.period === 'week' ? 12 : g.period === 'month' ? 6 : 3;
  const hist = [];
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
export const fmtP = (g, start) => (g.period === 'year' ? String(start.getFullYear()) : g.period === 'month' ? fmtMonthYearShort(start) : t('goals.weekFrom', { d: fmtDate(start) }));
