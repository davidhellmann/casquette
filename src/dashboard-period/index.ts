import { cards } from './cards.ts';
import type { PeriodCards, PeriodGear, DerivedStats } from './cards.ts';
import { history } from './history.ts';
import type { PeriodHistory } from './history.ts';
import { addDays, bestCurve, calendarDay, daysBetween, fitnessSeries, rideCalendar, rideDate, startOfDay, weekStart } from '../training/index.ts';
import type { AthleteState, Basis, BestCurve, FitnessDay } from '../training/index.ts';
import { tizTotal } from '../ride/index.ts';
import type { Ride, TizBasis, TizTotal } from '../ride/index.ts';

export type {
  AcwrStatus, Curves, CurveKey, DerivedStats, FormStatus, Garage, GarageBike, LoadDay, LoadVerdict, Nutrition,
  PeriodCards, PeriodGear, PeriodLoad, Polarization, RampStatus, Rhythm, RideFueling, Sparks, Weekly, WeeklyBucket,
} from './cards.ts';
export type {
  CumulativeYear, DashboardCalendar, DashboardCalendarCell, DashboardCalendarDay, DashboardCalendarRide, HistoryYear,
  PeriodHistory,
} from './history.ts';

/**
 * A final, flat ride as the dashboard period reads it: from the ride module (`Ride`) or decoded from the
 * dashboard payload, which carries the TIZ basis only for the bases with TIZ and `kg` only for rides
 * with a power curve.
 */
export interface PeriodRide extends Pick<Ride,
  'id' | 'name' | 'start_local' | 'start' | 'd' | 'stats' | 'indoor' | 'gear_id' | 'distance' | 'moving_time' | 'h' |
  'elev' | 'speed' | 'kcal' | 'pr' | 'ach' | 'w' | 'avg_wkg' | 'np' | 'hr' | 'hr_max' | 'tss' | 'ef' | 'load' | 'best' |
  'tizP' | 'tizH' | 'dec' | 'clsP' | 'clsH'> {
  /** Body weight on the ride date; only needed for the W/kg of power curve bests. */
  kg: number | null;
  tizBasis?: Partial<TizBasis> | null;
}

/** A selectable period in calendar days; 0 = all time. */
export type PeriodDays = 7 | 14 | 30 | 90 | 365 | 0;

/** Options of `dashboardPeriod`. */
export interface DashboardPeriodOptions<G extends PeriodGear = PeriodGear> {
  days: PeriodDays;
  /** Which ride classification counts (power or HR preferred). */
  basis: Basis;
  /** The explicit clock: decides which rides already happened and today's calendar day. */
  now: Date;
  /** Gear for the garage; not used for training metrics. */
  gear?: readonly G[];
  /** Today's athlete state, for daily needs and the FTP test hint; without it (or its weight) they are unknown/neutral. */
  athleteState?: Partial<Pick<AthleteState, 'ftp' | 'weight'>> | null;
}

/** Period bounds and the rides in them. */
export interface PeriodBounds<R> {
  now: Date;
  /** Local midnight of `now`. */
  today: Date;
  /** Calendar end (local midnight): the single upper bound of every calendar view. */
  calendarEnd: Date;
  /** Ride date of the first stat ride (or today without any). */
  oldest: Date;
  /** Calendar days of the period (all time: from `oldest`). */
  days: number;
  periodStart: Date;
  /** Start of the previous period (same length, directly before). */
  prevStart: Date;
  /** First day of the 53-week training calendar. */
  heatStart: Date;
  /** Admitted stat rides of all time, newest first. */
  ridesAll: R[];
  /** Stat rides in the period, newest first. */
  rides: R[];
  /** Ride log: admitted rides of the period including e-bike rides (all time: every admitted ride), newest first. */
  log: R[];
  /** Stat rides of the previous period (none for all time). */
  prevRides: R[];
  /** Whether a previous period exists (not for all time). */
  hasPrevious: boolean;
}

/** A day of the fitness series with its day key (`k`) and local midnight (`d`). */
export type PeriodFitnessDay = FitnessDay & { k: string; d: Date };

/** TIZ total of the period's rides without the per-zone seconds (those are in `S.exact`), plus the Z2 share. */
export type PeriodTiz<B extends Basis = Basis> = Omit<TizTotal<B>, 'seconds' | 'rides'> & {
  /** Z2 share of the total in %. */
  z2Percent: number;
};

/** Summed TIZ seconds of one ride per basis. */
export interface RideTizSeconds {
  power: number;
  hr: number;
}

/**
 * KPIs of the period (`S`) computed here; `DerivedStats` adds what the cards derive from them.
 * Suffix `P`: previous period; `1`/`2`: first/second half. Times in seconds, distances in metres.
 */
export interface BaseStats<R> {
  /** Rides. */
  n: number; nP: number;
  time: number; timeP: number;
  dist: number; distP: number;
  elev: number; elevP: number;
  kcal: number; kcalP: number;
  /** PRs. */
  pr: number; prP: number;
  tss: number; tssP: number;
  /** Achievements. */
  ach: number;
  /** Time-weighted averages; null without any known value. */
  avgWkg: number | null;
  avgW: number | null; avgW1: number | null; avgW2: number | null;
  avgHR: number | null; avgHR1: number | null; avgHR2: number | null;
  /** Moving time per ride classification zone (index = zone 1–7; index 0 unused). */
  zt: number[];
  /** Moving time without a zone. */
  zu: number;
  /** Moving time with a zone. */
  ztot: number;
  /** Shares of the classified time in %: Z1, Z2, Z3 and Z4+. */
  pZ1: number; pZ2: number; pZ3: number; pZ4: number;
  /** Easy share (Z1 + Z2) in %. */
  low: number;
  /** Z2 hours per week. */
  z2hWeek: number;
  /** Fitness, fatigue and form at the calendar end. */
  ctl: number; atl: number; tsb: number;
  /** Fitness change over the period. */
  ctlDelta: number;
  /** Best curves: period, first half, second half, all time. */
  curve: BestCurve; curve1: BestCurve; curve2: BestCurve; curveAll: BestCurve;
  /** Period rides with EF, oldest first. */
  efList: R[];
  /** EF of the first and last third of `efList` (only with at least 4 rides). */
  ef1?: number;
  ef2?: number;
  /** EF change from the first to the last third in %; null with fewer than 4 rides. */
  efTrend: number | null;
  /** TIZ per zone (`p` power, `h` HR) and the rides with TIZ (`np`, `nh`). */
  exact: { p: number[]; h: number[]; np: number; nh: number };
}

/** The dashboard period's KPIs (`D.S`). */
export type PeriodStats<R> = BaseStats<R> & DerivedStats;

/** Dashboard period (GLOSSARY): every dashboard card result for one period and basis (`D`). */
export interface DashboardPeriod<R extends PeriodRide = PeriodRide, G extends PeriodGear = PeriodGear>
  extends PeriodBounds<R>, PeriodCards<R, G>, PeriodHistory<R> {
  /** Fitness series of all time up to the calendar end. */
  fitness: PeriodFitnessDay[];
  /** Fitness series of the period. */
  pmc: PeriodFitnessDay[];
  tiz: { [B in Basis]: PeriodTiz<B> };
  /** TIZ seconds per ride of the ride log, by ride id. */
  rideTiz: Record<string, RideTizSeconds>;
  /** Period rides with power or HR, oldest first. */
  powerHr: R[];
  S: PeriodStats<R>;
}

/** Numeric ride fields the period sums or averages. */
type NumericKey = 'moving_time' | 'distance' | 'elev' | 'kcal' | 'pr' | 'tss' | 'ach' | 'ef' | 'avg_wkg' | 'w' | 'hr';

const sum = (rides: readonly PeriodRide[], key: NumericKey): number => rides.reduce((s, r) => s + (r[key] ?? 0), 0);
const weighted = (rides: readonly PeriodRide[], key: NumericKey): number | null => {
  const known = rides.filter(r => r[key] != null), time = sum(known, 'moving_time');
  return time ? known.reduce((s, r) => s + (r[key] ?? 0) * r.moving_time, 0) / time : null;
};
const curve = (rides: readonly PeriodRide[]) => bestCurve(rides.map(r => ({ id: r.id, best: r.best })));
/** Calendar day of a date that is valid by construction (from the validated clock or an admitted ride). */
const dayKey = (d: Date): string => calendarDay(d) ?? '';
const periodTiz = <B extends Basis>({ seconds, rides, ...total }: TizTotal<B>): PeriodTiz<B> =>
  ({ ...total, z2Percent: total.total ? seconds[1] / total.total * 100 : 0 });

/** Selectable periods in calendar days; 0 = all time. */
export const PERIODS: readonly PeriodDays[] = [7, 14, 30, 90, 365, 0];
/** Zone bases a dashboard period can evaluate. */
export const BASES: readonly Basis[] = ['power', 'hr'];

/** Final, flat rides + period + classification basis + explicit clock → card data.
 * No I/O, mutation of inputs, current athlete settings or reclassification of rides.
 */
export function dashboardPeriod<R extends PeriodRide, G extends PeriodGear = PeriodGear>(
  all: readonly R[], { days: selectedDays, basis, now, gear = [], athleteState }: DashboardPeriodOptions<G>,
): DashboardPeriod<R, G> {
  if (!(now instanceof Date) || !Number.isFinite(+now)) throw new TypeError('now must be a valid Date');
  if (!PERIODS.includes(selectedDays) || !BASES.includes(basis)) throw new RangeError('Invalid dashboard period or basis');
  const today = startOfDay(now);
  const { available, end: calendarEnd } = rideCalendar(all, now);
  available.sort((a, b) => +b.d - +a.d);
  const ridesAll = available.filter(r => r.stats);
  const oldest = ridesAll.length ? startOfDay(ridesAll[ridesAll.length - 1].d) : today;
  const days = selectedDays || Math.max(1, daysBetween(oldest, calendarEnd) + 1);
  const periodStart = addDays(calendarEnd, 1 - days), prevStart = addDays(periodStart, -days);
  const bounds: PeriodBounds<R> = { now: new Date(now), today, calendarEnd, oldest, days, periodStart, prevStart, heatStart: addDays(weekStart(calendarEnd), -364), ridesAll,
    rides: ridesAll.filter(r => r.d >= periodStart), log: selectedDays ? available.filter(r => r.d >= periodStart) : available,
    prevRides: selectedDays ? ridesAll.filter(r => r.d >= prevStart && r.d < periodStart) : [],
    hasPrevious: selectedDays !== 0 };
  const R = bounds.rides, Pv = bounds.prevRides;
  // Preserve legacy odd-day split: the first half has floor(days / 2) calendar days.
  const mid = addDays(periodStart, Math.floor(days / 2));
  const h1 = R.filter(r => r.d < mid), h2 = R.filter(r => r.d >= mid);
  const cls = (r: R) => basis === 'hr' ? r.clsH : r.clsP;
  const zt: number[] = Array(8).fill(0);
  let zu = 0;
  for (const r of R) { const z = cls(r).zone; if (z) zt[z] += r.moving_time; else zu += r.moving_time; }
  const ztot = zt.reduce((a, b) => a + b, 0);
  const pc = (z: number) => ztot ? zt[z] / ztot * 100 : 0;
  const pZ1 = pc(1), pZ2 = pc(2);
  const fitness: PeriodFitnessDay[] = fitnessSeries(ridesAll.map(r => ({ day: rideDate(r), tss: r.load })), { to: dayKey(calendarEnd) })
    .map(x => ({ ...x, k: x.day, d: new Date(x.day + 'T00:00:00') }));
  const pmc = fitness.filter(x => x.day >= dayKey(periodStart));
  const last = pmc.at(-1) || { ctl: 0, atl: 0, tsb: 0 };
  const efList = R.filter(r => r.ef != null).sort((a, b) => +a.d - +b.d);
  let efTrend: number | null = null, efThirds: { ef1: number; ef2: number } | null = null;
  if (efList.length >= 4) {
    const k = Math.max(1, Math.floor(efList.length / 3)), avg = (a: R[]) => sum(a, 'ef') / a.length;
    const ef1 = avg(efList.slice(0, k)), ef2 = avg(efList.slice(-k));
    efThirds = { ef1, ef2 };
    efTrend = ef1 > 0 ? (ef2 - ef1) / ef1 * 100 : null;
  }
  const tiz = { power: tizTotal(R, 'power'), hr: tizTotal(R, 'hr') };
  const S: BaseStats<R> = {
    n: R.length, nP: Pv.length,
    time: sum(R, 'moving_time'), timeP: sum(Pv, 'moving_time'), dist: sum(R, 'distance'), distP: sum(Pv, 'distance'),
    elev: sum(R, 'elev'), elevP: sum(Pv, 'elev'), kcal: sum(R, 'kcal'), kcalP: sum(Pv, 'kcal'),
    pr: sum(R, 'pr'), prP: sum(Pv, 'pr'), tss: sum(R, 'tss'), tssP: sum(Pv, 'tss'),
    ach: sum(R, 'ach'),
    avgWkg: weighted(R, 'avg_wkg'),
    avgW: weighted(R, 'w'), avgW1: weighted(h1, 'w'), avgW2: weighted(h2, 'w'),
    avgHR: weighted(R, 'hr'), avgHR1: weighted(h1, 'hr'), avgHR2: weighted(h2, 'hr'),
    zt, zu, ztot, pZ1, pZ2, pZ3: pc(3), pZ4: [4, 5, 6, 7].reduce((s, z) => s + pc(z), 0),
    low: pZ1 + pZ2, z2hWeek: zt[2] / 3600 / (days / 7),
    ctl: last.ctl, atl: last.atl, tsb: last.tsb, ctlDelta: pmc.length ? last.ctl - pmc[0].ctl : 0,
    curve: curve(R), curve1: curve(h1), curve2: curve(h2), curveAll: curve(ridesAll),
    efList, efTrend, ...efThirds,
    exact: { p: tiz.power.seconds, h: tiz.hr.seconds, np: tiz.power.rides, nh: tiz.hr.rides },
  };
  const results = {
    tiz: { power: periodTiz(tiz.power), hr: periodTiz(tiz.hr) },
    rideTiz: Object.fromEntries(bounds.log.map(r => [r.id, { power: (r.tizP || []).reduce((a, b) => a + b, 0), hr: (r.tizH || []).reduce((a, b) => a + b, 0) }])),
    powerHr: R.filter(r => r.w != null || r.hr != null).sort((a, b) => +a.d - +b.d),
  };
  const { stats, ...card } = cards({ ...bounds, fitness }, S, basis, gear, athleteState);
  return { ...bounds, fitness, pmc, ...results, S: { ...S, ...stats }, ...card, ...history(bounds, selectedDays) };
}
