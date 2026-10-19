/**
 * Build payload of /performance from the build dataset: estimated FTP and W/kg per month, long-term
 * fitness, power curves and the power profile per year, today's FTP and body weight. Build time.
 */
import type { PerformancePayload } from '../components/performance/PerformanceView';
import type { PerformanceMonth } from '../components/performance/PerformanceView';
import type { BuildDataset } from './build-dataset.ts';
import type { Ride } from '../ride/index.ts';
import { addDays, bestCurve, calendarDay, fitnessSeries, rideDate } from '../training/index.ts';
import type { BestCurve, FitnessRide } from '../training/index.ts';

/** Ride → input for the fitness series (ride date, as on the dashboard). */
const fitnessInput = (r: Ride): FitnessRide => ({ day: rideDate(r), tss: r.load });
/** Calendar day of a date that is valid by construction (the build calendar, a dated history entry). */
const dayKey = (d: Date): string => calendarDay(d) ?? '';
const watts = (best: BestCurve) => Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.w]));

/** Durations of the power profile: seconds and label. */
export const PROFILE_DURS: [number, string][] = [[5, '5 s'], [60, '1 min'], [300, '5 min'], [1200, '20 min'], [3600, '60 min']];

/** Admitted stat rides up to the calendar end; the months run to the calendar end, "last year" is the year before it. */
export function performancePayload(data: BuildDataset): PerformancePayload {
  const { statRides: rides, end: today } = data.calendar;
  const asc = rides.slice().sort((a, b) => +a.d - +b.d);
  const withCurve = asc.filter((r) => r.best);
  const byId = new Map(withCurve.map((r) => [r.id, r]));

  // Monthly series: estimated FTP from the last 90 days (max(0.95 × 20 min, 60 min))
  const months: PerformancePayload['months'] = [];
  if (asc.length) {
    for (let m = new Date(asc[0].d.getFullYear(), asc[0].d.getMonth(), 1); m <= today; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59);
      const from = addDays(end, -90);
      const rolling = bestCurve(withCurve.filter((r) => r.d >= from && r.d <= end));
      const monthly = bestCurve(withCurve.filter((r) => r.d >= m && r.d <= end));
      const m20 = monthly[1200]?.w ?? null;
      const e20 = Math.round((rolling[1200]?.w || 0) * 0.95), e60 = rolling[3600]?.w || 0;
      const eftp = Math.max(e20, e60) || null;
      const originId = (e20 >= e60 ? rolling[1200] : rolling[3600])?.id;
      const origin = originId === undefined ? undefined : byId.get(originId);
      // Body weight at month end; eFTP W/kg instead uses the effort date.
      const { ftp, weight } = data.athleteAt(end);
      months.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, eftp, best20: m20 || null, ftp, weight, wkg: eftp && origin ? +(eftp / origin.kg).toFixed(2) : null });
    }
  }
  const withE = months.filter((x): x is PerformanceMonth & { eftp: number } => !!x.eftp);
  const peak = withE.reduce<(typeof withE)[number] | null>((m, x) => (!m || x.eftp > m.eftp ? x : m), null);
  const current = withE[withE.length - 1] || null;

  // Long-term fitness (CTL) – sampled weekly
  const series = fitnessSeries(asc.map(fitnessInput), { to: dayKey(today) });
  const ctl = series
    .filter((x, i) => i % 7 === 0 || i === series.length - 1)
    .map((x) => ({ date: x.day, ctl: x.ctl, atl: x.atl }));
  const peakCtl = ctl.reduce<(typeof ctl)[number] | null>((m, x) => (!m || x.ctl > m.ctl ? x : m), null);

  // Power profile per year
  const years = Array.from(new Set<number>(withCurve.map((r) => r.year))).sort((a, b) => b - a);
  const profile = years.map((y) => {
    const c = bestCurve(withCurve.filter((r) => r.year === y));
    return { year: y, vals: PROFILE_DURS.map(([s]) => {
      const best = c[s];
      const ride = best && byId.get(best.id);
      // A best's ride is always one of `withCurve` (the curve is built from them)
      if (!best || !ride) return null;
      return { w: best.w, wkg: best.w / ride.kg, kg: ride.kg, id: best.id };
    }) };
  });
  const lastYear = today.getFullYear() - 1;
  const allTime = bestCurve(withCurve);
  const last90 = bestCurve(withCurve.filter((r) => r.d >= addDays(today, -90)));
  const ly = bestCurve(withCurve.filter((r) => r.year === lastYear));
  const allTimeWkg = data.curveWkg(allTime);
  const { ftp, weight: kg } = data.athleteToday;

  return {
    ftp, kg,
    current: current ? { eftp: current.eftp, wkg: current.wkg } : null,
    peak: peak ? { key: peak.key, eftp: peak.eftp, wkg: peak.wkg } : null,
    peakCtl: peakCtl ? { date: peakCtl.date, ctl: peakCtl.ctl } : null,
    bests: PROFILE_DURS.slice(0, 4).map(([s, label]) => ({ label, w: allTime[s]?.w ?? null, wkg: allTime[s] ? allTimeWkg[s] : null })),
    months,
    ctl,
    curves: { all: watts(allTime), d90: watts(last90), ly: watts(ly) },
    curveWkg: { all: allTimeWkg, d90: data.curveWkg(last90), ly: data.curveWkg(ly) },
    lastYear,
    history: data.history.slice().reverse().map((h) => ({ date: dayKey(h.d), ftp: h.ftp ?? null, weight: h.weight ?? null, source: h.source || null, note: h.note || null })),
    profile,
    durations: PROFILE_DURS.map(([, label]) => label),
    years: months.length ? Math.round(months.length / 12) : 0,
    rides: withCurve.length,
  };
}
