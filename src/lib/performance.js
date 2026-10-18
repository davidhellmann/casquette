/** Performance development: eFTP, W/kg, long-term fitness, power profile per year. */
import { loadStatRides, loadHistory, ftpAt, weightAt } from './data.js';
import { bestCurve, fitnessSeries, rideCalendar } from '../training/index.js';
import { dkey, addDays } from '../scripts/format.js';

/** Ride → input for the fitness series (calendar day from the local start time, as on the dashboard). */
const fitnessInput = (r) => ({ day: r.start_local.slice(0, 10), tss: r.load });

export const PROFILE_DURS = [[5, '5 s'], [60, '1 min'], [300, '5 min'], [1200, '20 min'], [3600, '60 min']];

export async function performanceData() {
  const { available: rides, end: today } = rideCalendar(await loadStatRides(), new Date());
  const asc = rides.slice().sort((a, b) => a.d - b.d);
  const withCurve = asc.filter((r) => r.best);
  const byId = new Map(withCurve.map((r) => [r.id, r]));

  // Monthly series: estimated FTP from the last 90 days (max(0.95 × 20 min, 60 min))
  const months = [];
  if (asc.length) {
    for (let m = new Date(asc[0].d.getFullYear(), asc[0].d.getMonth(), 1); m <= today; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59);
      const from = addDays(end, -90);
      const rolling = bestCurve(withCurve.filter((r) => r.d >= from && r.d <= end));
      const monthly = bestCurve(withCurve.filter((r) => r.d >= m && r.d <= end));
      const m20 = monthly[1200]?.w ?? null;
      const e20 = Math.round((rolling[1200]?.w || 0) * 0.95), e60 = rolling[3600]?.w || 0;
      const eftp = Math.max(e20, e60) || null;
      const origin = byId.get((e20 >= e60 ? rolling[1200] : rolling[3600])?.id);
      const w = weightAt(end); // Body weight at month end; eFTP W/kg instead uses the effort date.
      months.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, d: m, eftp, best20: m20 || null, ftp: ftpAt(end), weight: w, wkg: eftp && origin ? +(eftp / origin.kg).toFixed(2) : null });
    }
  }
  const withE = months.filter((x) => x.eftp);
  const peak = withE.reduce((m, x) => (!m || x.eftp > m.eftp ? x : m), null);
  const current = withE[withE.length - 1] || null;

  // Long-term fitness (CTL) – sampled weekly
  const series = fitnessSeries(asc.map(fitnessInput), { to: dkey(today) });
  const ctl = series
    .filter((x, i) => i % 7 === 0 || i === series.length - 1)
    .map((x) => ({ date: x.day, ctl: x.ctl, atl: x.atl }));
  const peakCtl = ctl.reduce((m, x) => (!m || x.ctl > m.ctl ? x : m), null);

  // Power profile per year
  const years = Array.from(new Set(withCurve.map((r) => r.year))).sort((a, b) => b - a);
  const profile = years.map((y) => {
    const c = bestCurve(withCurve.filter((r) => r.year === y));
    return { year: y, vals: PROFILE_DURS.map(([s]) => {
      if (!c[s]) return null;
      const kg = byId.get(c[s].id).kg;
      return { w: c[s].w, wkg: c[s].w / kg, kg, id: c[s].id };
    }) };
  });
  const allTime = bestCurve(withCurve);
  const last90 = bestCurve(withCurve.filter((r) => r.d >= addDays(today, -90)));
  const lastYear = bestCurve(withCurve.filter((r) => r.year === today.getFullYear() - 1));

  return { months, peak, current, ctl, peakCtl, profile, allTime, last90, lastYear, history: loadHistory(), rideCount: withCurve.length };
}
