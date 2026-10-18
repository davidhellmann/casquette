import { cards } from './cards.js';
import { history } from './history.js';
import { addDays, bestCurve, calendarDay, daysBetween, fitnessSeries, rideCalendar, rideDate, startOfDay, weekStart } from '../training/index.js';
import { tizTotal } from '../ride/index.js';

const sum = (rides, key) => rides.reduce((s, r) => s + (r[key] ?? 0), 0);
const weighted = (rides, key) => {
  const known = rides.filter(r => r[key] != null), time = sum(known, 'moving_time');
  return time ? known.reduce((s, r) => s + r[key] * r.moving_time, 0) / time : null;
};
const curve = rides => bestCurve(rides.map(r => ({ id: r.id, best: r.best })));
/** Selectable periods in calendar days; 0 = all time. */
export const PERIODS = [7, 14, 30, 90, 365, 0];
/** Zone bases a dashboard period can evaluate. */
export const BASES = ['power', 'hr'];

/** Final, flat rides + period + classification basis + explicit clock → card data.
 * No I/O, mutation of inputs, current athlete settings or reclassification of rides.
 */
export function dashboardPeriod(all, { days: selectedDays, basis, now, gear = [], athleteState }) {
  if (!(now instanceof Date) || !Number.isFinite(+now)) throw new TypeError('now must be a valid Date');
  if (!PERIODS.includes(selectedDays) || !BASES.includes(basis)) throw new RangeError('Invalid dashboard period or basis');
  const today = startOfDay(now);
  const { available, end: calendarEnd } = rideCalendar(all, now);
  available.sort((a, b) => b.d - a.d);
  const ridesAll = available.filter(r => r.stats);
  const oldest = ridesAll.length ? startOfDay(ridesAll.at(-1).d) : today;
  const days = selectedDays || Math.max(1, daysBetween(oldest, calendarEnd) + 1);
  const periodStart = addDays(calendarEnd, 1 - days), prevStart = addDays(periodStart, -days);
  const D = { now: new Date(now), today, calendarEnd, oldest, days, periodStart, prevStart, heatStart: addDays(weekStart(calendarEnd), -364), ridesAll,
    rides: ridesAll.filter(r => r.d >= periodStart), log: selectedDays ? available.filter(r => r.d >= periodStart) : available,
    prevRides: selectedDays ? ridesAll.filter(r => r.d >= prevStart && r.d < periodStart) : [],
    hasPrevious: selectedDays !== 0 };
  const R = D.rides, Pv = D.prevRides, S = { n: R.length, nP: Pv.length };
  for (const [name, key] of Object.entries({ time: 'moving_time', dist: 'distance', elev: 'elev', kcal: 'kcal', pr: 'pr', tss: 'tss' })) {
    S[name] = sum(R, key); S[name + 'P'] = sum(Pv, key);
  }
  S.ach = sum(R, 'ach');
  // Preserve legacy odd-day split: the first half has floor(days / 2) calendar days.
  const mid = addDays(periodStart, Math.floor(days / 2));
  const h1 = R.filter(r => r.d < mid), h2 = R.filter(r => r.d >= mid);
  S.avgWkg = weighted(R, 'avg_wkg');
  for (const [key, name] of [['w', 'avgW'], ['hr', 'avgHR']]) {
    S[name] = weighted(R, key); S[name + '1'] = weighted(h1, key); S[name + '2'] = weighted(h2, key);
  }
  const cls = r => basis === 'hr' ? r.clsH : r.clsP;
  S.zt = Array(8).fill(0); S.zu = 0;
  for (const r of R) { const z = cls(r).zone; if (z) S.zt[z] += r.moving_time; else S.zu += r.moving_time; }
  S.ztot = S.zt.reduce((a, b) => a + b, 0);
  const pc = z => S.ztot ? S.zt[z] / S.ztot * 100 : 0;
  S.pZ1 = pc(1); S.pZ2 = pc(2); S.pZ3 = pc(3); S.pZ4 = [4, 5, 6, 7].reduce((s, z) => s + pc(z), 0);
  S.low = S.pZ1 + S.pZ2; S.z2hWeek = S.zt[2] / 3600 / (days / 7);
  D.fitness = fitnessSeries(ridesAll.map(r => ({ day: rideDate(r), tss: r.load })), { to: calendarDay(calendarEnd) })
    .map(x => ({ ...x, k: x.day, d: new Date(x.day + 'T00:00:00') }));
  D.pmc = D.fitness.filter(x => x.day >= calendarDay(periodStart));
  const last = D.pmc.at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  S.ctl = last.ctl; S.atl = last.atl; S.tsb = last.tsb; S.ctlDelta = D.pmc.length ? last.ctl - D.pmc[0].ctl : 0;
  S.curve = curve(R); S.curve1 = curve(h1); S.curve2 = curve(h2); S.curveAll = curve(ridesAll);
  S.efList = R.filter(r => r.ef != null).sort((a, b) => a.d - b.d); S.efTrend = null;
  if (S.efList.length >= 4) {
    const k = Math.max(1, Math.floor(S.efList.length / 3)), avg = a => sum(a, 'ef') / a.length;
    S.ef1 = avg(S.efList.slice(0, k)); S.ef2 = avg(S.efList.slice(-k));
    S.efTrend = S.ef1 > 0 ? (S.ef2 - S.ef1) / S.ef1 * 100 : null;
  }
  const tiz = { power: tizTotal(R, 'power'), hr: tizTotal(R, 'hr') };
  S.exact = { p: tiz.power.seconds, h: tiz.hr.seconds, np: tiz.power.rides, nh: tiz.hr.rides };
  D.tiz = Object.fromEntries(Object.entries(tiz).map(([name, { seconds, rides, ...total }]) =>
    [name, { ...total, z2Percent: total.total ? seconds[1] / total.total * 100 : 0 }]));
  D.rideTiz = Object.fromEntries(D.log.map(r => [r.id, { power: (r.tizP || []).reduce((a,b)=>a+b,0), hr: (r.tizH || []).reduce((a,b)=>a+b,0) }]));
  D.powerHr = R.filter(r => r.w != null || r.hr != null).sort((a,b) => a.d-b.d);
  D.S = S;
  cards(D, basis, gear, athleteState);
  history(D, selectedDays);
  return D;
}
