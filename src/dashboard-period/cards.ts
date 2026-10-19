/** Card results of a dashboard period, derived from its bounds, rides and KPIs. Pure. */
import { addDays, calendarDay, dailyNeeds, decouplingStatus, ftpRecommendation, fuel, fuelCell, records, weekStart } from '../training/index.ts';
import type {
  AthleteState, Basis, BestCurve, DailyNeeds, DecouplingStatus, FtpRecommendation, FuelCell, Fueling, NeedsCategory, Range,
  Records,
} from '../training/index.ts';
import type { BaseStats, PeriodBounds, PeriodFitnessDay, PeriodRide } from './index.ts';

/** Gear as the garage reads it. */
export interface PeriodGear {
  id: string;
  /** 'bike' or 'shoe'; only bikes are in the garage. */
  type?: string | null;
  retired?: boolean | null;
}

/** A bike in the garage with the distance of its synced stat rides (metres). */
export type GarageBike<G> = G & { statsDistance: number };

/** The garage (GLOSSARY "Garage"). */
export interface Garage<G> {
  /** Active bikes, most ridden first. */
  active: GarageBike<G>[];
  retired: GarageBike<G>[];
  /** Summed stat ride distance of all bikes (metres). */
  total: number;
  /** Largest stat ride distance of an active bike (at least 1). */
  max: number;
}

/** Fueling of a ride with its cell in the fueling matrix. */
export type RideFueling = Fueling & { cell: FuelCell };

/** Carbohydrate and fluid totals of the period. */
export interface Nutrition {
  /** Average daily training hours. */
  dailyHours: number;
  category: NeedsCategory;
  /** Carbohydrate factor range per kg body weight. */
  carbsPerKg: Range;
  /** Carbohydrate during the period's rides, g. */
  fuel: number;
  /** Fluid during the period's rides, l. */
  fluid: number;
}

/** When the period's riding happened (hours, except `hours`). */
export interface Rhythm {
  /** Hours per weekday, Monday first. */
  weekdays: number[];
  /** Rides per start hour 0–23. */
  hours: number[];
  indoor: number;
  outdoor: number;
  total: number;
}

/** A week (or month) of the weekly chart. */
export interface WeeklyBucket {
  /** Start of the week (Monday) or month. */
  d: Date;
  /** Hours per zone (index 1–5; Z5 includes everything above). */
  z: number[];
  /** Hours without a zone. */
  u: number;
  total: number;
  /** Total of the displayed bars, each rounded to 2 decimals like the bars. */
  tooltipTotal: number;
}

/** The weekly chart: week buckets, or month buckets for periods over 400 days. */
export interface Weekly {
  monthly: boolean;
  buckets: WeeklyBucket[];
}

/** The best curves of the period (`S.curve…`). */
export type CurveKey = 'curve' | 'curve1' | 'curve2' | 'curveAll';

/** Durations of the power curve chart and W/kg of each best with the weight on its ride date. */
export interface Curves {
  /** Durations (seconds, from 5 s) any best curve has, ascending. */
  seconds: number[];
  /** Per best curve: duration → W/kg, null without a known weight. */
  wkg: Record<CurveKey, Record<string, number | null>>;
}

/** Twelve buckets per KPI over the period: sums, or time-weighted averages for power and HR (null when empty). */
export interface Sparks {
  n: number[];
  time: number[];
  dist: number[];
  elev: number[];
  power: (number | null)[];
  hr: (number | null)[];
  tss: number[];
  pr: number[];
}

/** A day of the load series: the fitness day with its load as `L`. */
export type LoadDay = PeriodFitnessDay & { L: number };

export type RampStatus = 'steep' | 'fast' | 'sustainable' | 'stable' | 'decline';
export type AcwrStatus = 'unknown' | 'risk' | 'high' | 'sweet' | 'low';
export type LoadVerdict = 'fatigue' | 'steep' | 'decline' | 'low' | 'balanced';

/** Load card: ramp rate, acute:chronic workload ratio, rest and load series with status codes. */
export interface PeriodLoad {
  /** The day at the calendar end; `{ ctl: 0, atl: 0 }` without any ride. */
  cur: LoadDay | { ctl: number; atl: number };
  /** Fitness change over the last 7 days. */
  ramp: number;
  /** Fitness change over the last 42 days. */
  ctl6: number;
  last7: number;
  /** Average weekly load of the 6 weeks before the last 7 days. */
  avg7: number;
  /** Acute:chronic workload ratio, null with fitness ≤ 1. */
  acwr: number | null;
  /** Days without load in the last 14. */
  rest14: number;
  /** Consecutive days with load up to the calendar end. */
  streak: number;
  /** Form of the day before the calendar end. */
  tsb: number;
  last28: LoadDay[];
  /** Largest load of the last 28 days (at least 1). */
  mx: number;
  rampStatus: RampStatus;
  acwrStatus: AcwrStatus;
  verdict: LoadVerdict;
}

/** Form status (GLOSSARY) by TSB. */
export type FormStatus = 'transition' | 'fresh' | 'neutral' | 'optimal' | 'risk';
/** 80/20 status of the period's zone distribution. */
export type Polarization = 'empty' | 'balanced' | 'middle' | 'easy';

/** KPIs the cards derive from the base KPIs (`D.S`). */
export interface DerivedStats {
  /** Rolling 5-ride average of EF over `efList`. */
  efRolling: number[];
  /** 95 % of the best 20-minute power in the period. */
  estimatedFtp: number | null;
  form: FormStatus;
  polarization: Polarization;
  /** Change against the previous period in % (null for all time or without a previous value); power/HR: second vs first half. */
  deltas: Record<'n' | 'time' | 'dist' | 'elev' | 'tss' | 'pr' | 'power' | 'hr', number | null>;
  hoursPerWeek: number;
  tssPerWeek: number;
  kmPerRide: number;
}

/** Card results of a dashboard period. */
export interface PeriodCards<R, G> {
  records: Records<R>;
  /** Fueling per ride of the ride log, by ride id. */
  fueling: Record<string, RideFueling>;
  /** Daily needs with today's body weight. */
  dailyNeeds: DailyNeeds;
  nutrition: Nutrition;
  /** Decoupling status per ride of the ride log, by ride id. */
  decoupling: Record<string, DecouplingStatus>;
  rhythm: Rhythm;
  /** Kilometres per gear id in the period. */
  gearKm: Record<string, number>;
  weekly: Weekly;
  curves: Curves;
  ftpRecommendation: FtpRecommendation;
  sparks: Sparks;
  load: PeriodLoad;
  garage: Garage<G>;
}

const percent = (current: number | null, previous: number | null) => current == null || !previous ? null : (current - previous) / previous * 100;
/** Calendar day of a date that is valid by construction (period bounds, admitted rides). */
const dayKey = (d: Date): string => calendarDay(d) ?? '';

export function cards<R extends PeriodRide, G extends PeriodGear>(
  D: PeriodBounds<R> & { fitness: PeriodFitnessDay[] }, S: BaseStats<R>, basis: Basis, gear: readonly G[],
  athleteState: Partial<Pick<AthleteState, 'ftp' | 'weight'>> | null | undefined,
): PeriodCards<R, G> & { stats: DerivedStats } {
  const { rides: R, days } = D, cls = (r: R) => basis === 'hr' ? r.clsH : r.clsP;
  const dailyHours = S.time / 3600 / days;
  const fueling: Record<string, RideFueling> = Object.fromEntries(D.log.map(r => [r.id, { ...fuel(r.moving_time, cls(r).zone), cell: fuelCell(r.moving_time, cls(r).zone) }]));
  const needs = dailyNeeds(dailyHours, athleteState?.weight);
  const nutrition: Nutrition = { dailyHours, category: needs.category, carbsPerKg: needs.perKg.carbs,
    fuel: R.reduce((s,r) => s + fueling[r.id].total, 0), fluid: R.reduce((s,r) => s + r.h * .65, 0) };
  const decoupling = Object.fromEntries(D.log.map(r => [r.id, decouplingStatus(r.dec)]));
  const rhythmParts = { weekdays: Array<number>(7).fill(0), hours: Array<number>(24).fill(0), indoor: 0, outdoor: 0 };
  const gearKm: Record<string, number> = {};
  for (const r of R) {
    rhythmParts.weekdays[(r.d.getDay() + 6) % 7] += r.h; rhythmParts.hours[r.d.getHours()]++;
    rhythmParts[r.indoor ? 'indoor' : 'outdoor'] += r.h;
    if (r.gear_id) gearKm[r.gear_id] = (gearKm[r.gear_id] || 0) + (r.distance || 0) / 1000;
  }
  const rhythm: Rhythm = { ...rhythmParts, total: rhythmParts.indoor + rhythmParts.outdoor };
  const monthly = days > 400, buckets: WeeklyBucket[] = [], idx: Record<string, number> = {};
  const key = (d: Date) => monthly ? dayKey(d).slice(0, 7) : dayKey(weekStart(d));
  const calendarEnd = D.calendarEnd;
  for (let d = monthly ? new Date(D.periodStart.getFullYear(), D.periodStart.getMonth(), 1) : weekStart(D.periodStart);
    d <= calendarEnd; d = monthly ? new Date(d.getFullYear(), d.getMonth()+1, 1) : addDays(d, 7)) {
    idx[key(d)] = buckets.length; buckets.push({ d, z: Array(6).fill(0), u: 0, total: 0, tooltipTotal: 0 });
  }
  for (const r of R) {
    const b = buckets[idx[key(r.d)]], z = cls(r).zone;
    if (z) b.z[Math.min(z, 5)] += r.h; else b.u += r.h;
    b.total += r.h;
  }
  // Tooltip sums displayed bars, preserving the original per-series rounding.
  for (const b of buckets) b.tooltipTotal = [...b.z.slice(1), b.u].reduce((s,v) => s + +v.toFixed(2), 0);
  const efRolling = S.efList.map((_, i, list) => { const a = list.slice(Math.max(0, i - 4), i + 1); return +(a.reduce((s,r) => s + (r.ef ?? 0), 0) / a.length).toFixed(3); });
  const byId = new Map(D.ridesAll.map(r => [r.id, r]));
  const CURVES: CurveKey[] = ['curve','curve1','curve2','curveAll'];
  const wkg = (c: BestCurve) => Object.fromEntries(Object.entries(c).map(([s,p]) => {
    const kg = byId.get(p.id)?.kg; return [s, kg != null && kg > 0 ? p.w / kg : null];
  }));
  const curves: Curves = { seconds: [...new Set(CURVES.flatMap(k => Object.keys(S[k]).map(Number)))].filter(s => s >= 5).sort((a,b) => a-b),
    wkg: { curve: wkg(S.curve), curve1: wkg(S.curve1), curve2: wkg(S.curve2), curveAll: wkg(S.curveAll) } };
  const best20 = S.curve[1200];
  const estimatedFtp = best20?.w ? Math.round(best20.w * .95) : null;
  const form: FormStatus = S.tsb > 25 ? 'transition' : S.tsb > 5 ? 'fresh' : S.tsb > -10 ? 'neutral' : S.tsb > -30 ? 'optimal' : 'risk';
  const polarization: Polarization = !S.ztot ? 'empty' : S.low >= 75 && S.pZ4 >= 5 ? 'balanced' : S.low < 75 ? 'middle' : 'easy';
  const vsPrevious = (current: number, previous: number) => D.hasPrevious ? percent(current, previous) : null;
  const deltas = { n: vsPrevious(S.n, S.nP), time: vsPrevious(S.time, S.timeP), dist: vsPrevious(S.dist, S.distP),
    elev: vsPrevious(S.elev, S.elevP), tss: vsPrevious(S.tss, S.tssP), pr: vsPrevious(S.pr, S.prP),
    power: percent(S.avgW2, S.avgW1), hr: percent(S.avgHR2, S.avgHR1) };
  const stats: DerivedStats = { efRolling, estimatedFtp, form, polarization, deltas,
    hoursPerWeek: S.time / 3600 / (days / 7), tssPerWeek: S.tss / (days / 7), kmPerRide: S.n ? S.dist / 1000 / S.n : 0 };
  const n = 12, start = +D.periodStart, width = (+addDays(D.calendarEnd, 1) - start) / n;
  const slot = (r: R) => Math.min(n-1, Math.max(0, Math.floor((+r.d - start) / width)));
  const sumSpark = (f: (r: R) => number | null): number[] => {
    const v: number[] = Array(n).fill(0);
    for (const r of R) { const x = f(r); if (x == null) continue; v[slot(r)] += +x || 0; }
    return v;
  };
  const avgSpark = (f: (r: R) => number | null): (number | null)[] => {
    const v: number[] = Array(n).fill(0), wt: number[] = Array(n).fill(0);
    for (const r of R) { const x = f(r); if (x == null) continue; const i = slot(r); v[i] += x * r.moving_time; wt[i] += r.moving_time; }
    return v.map((x,i) => wt[i] ? x / wt[i] : null);
  };
  const sparks: Sparks = { n: sumSpark(() => 1), time: sumSpark(r => r.h), dist: sumSpark(r => r.distance/1000), elev: sumSpark(r => r.elev),
    power: avgSpark(r => r.w), hr: avgSpark(r => r.hr), tss: sumSpark(r => r.tss), pr: sumSpark(r => r.pr) };
  const F: LoadDay[] = D.fitness.map(x => ({ ...x, L: x.load })), len = F.length, cur = F.at(-1) || { ctl: 0, atl: 0 };
  const at = (k: number) => F[Math.max(0, len-1-k)] || cur;
  const ramp = cur.ctl - at(7).ctl, acwr = cur.ctl > 1 ? cur.atl / cur.ctl : null, tsb = at(1).ctl - at(1).atl;
  let streak = 0; for (let i = len-1; i >= 0 && F[i].L > 0; i--) streak++;
  const load: PeriodLoad = { cur, ramp, ctl6: cur.ctl - at(42).ctl, last7: F.slice(-7).reduce((s,x)=>s+x.L,0),
    avg7: F.slice(-49,-7).reduce((s,x)=>s+x.L,0)/6, acwr, rest14: F.slice(-14).filter(x=>!x.L).length, streak, tsb,
    last28: F.slice(-28), mx: Math.max(1,...F.slice(-28).map(x=>x.L)),
    rampStatus: ramp > 8 ? 'steep' : ramp > 5 ? 'fast' : ramp >= 1 ? 'sustainable' : ramp > -2 ? 'stable' : 'decline',
    acwrStatus: acwr == null ? 'unknown' : acwr > 1.5 ? 'risk' : acwr > 1.3 ? 'high' : acwr >= .8 ? 'sweet' : 'low',
    verdict: tsb < -30 ? 'fatigue' : ramp > 8 ? 'steep' : ramp < -2 ? 'decline' : acwr != null && acwr < .8 ? 'low' : 'balanced' };
  const statsDistance: Record<string, number> = {};
  for (const r of D.ridesAll) if (r.gear_id) statsDistance[r.gear_id] = (statsDistance[r.gear_id] || 0) + (r.distance || 0);
  const bikes = gear.filter(g=>g.type === 'bike').map(g => ({ ...g, statsDistance: statsDistance[g.id] || 0 }));
  const active = bikes.filter(b=>!b.retired).sort((a,b)=>b.statsDistance-a.statsDistance);
  const garage: Garage<G> = { active, retired: bikes.filter(b=>b.retired), total:bikes.reduce((s,b)=>s+b.statsDistance,0), max:Math.max(1,...active.map(b=>b.statsDistance)) };
  return { stats, records: records(R), fueling, dailyNeeds: needs, nutrition, decoupling, rhythm, gearKm,
    weekly: { monthly, buckets }, curves, ftpRecommendation: ftpRecommendation(estimatedFtp, athleteState?.ftp), sparks, load, garage };
}
