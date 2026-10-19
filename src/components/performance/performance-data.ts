/**
 * Chart rows for the performance page, from the build payload (see src/pages/performance.astro).
 * Pure: the same rows feed the charts and the consumer tests (src/lib/training-consumers.test.ts).
 */
import type { PerformanceMonth, PerformancePayload } from './PerformanceView';

/** eFTP (rolling 90 days), best 20 min in the month and FTP from the athlete history, per month. */
export const ftpChartData = (months: readonly PerformanceMonth[]) => months.map((m) => ({ key: m.key, eftp: m.eftp, best20: m.best20, ftp: m.ftp }));

/** eFTP per kg (weight on the effort date) and body weight at month end, per month. */
export const wkgChartData = (months: readonly PerformanceMonth[]) => months.map((m) => ({ key: m.key, wkg: m.wkg, weight: m.weight }));

/** Long-term fitness (weekly samples), rounded to the shown precision. */
export const longTermFitnessData = (ctl: PerformancePayload['ctl']) => ctl.map((x) => ({ date: x.date, ctl: +x.ctl.toFixed(1), atl: +x.atl.toFixed(1) }));

/**
 * Power curves (best watts over duration ≥ 5 s): all-time, last 90 days and last year, each with W/kg
 * at the weight on the ride date. Missing values are null.
 */
export function powerCurveData({ curves, curveWkg }: Pick<PerformancePayload, 'curves' | 'curveWkg'>) {
  const secs = Object.keys(curves.all || {}).map(Number).filter((s) => s >= 5).sort((a, b) => a - b);
  const at = (o: Record<string, number | null> | undefined, s: number) => o?.[s] ?? null;
  return secs.map((s) => ({
    s,
    all: at(curves.all, s), allWkg: at(curveWkg.all, s),
    d90: at(curves.d90, s), d90Wkg: at(curveWkg.d90, s),
    ly: at(curves.ly, s), lyWkg: at(curveWkg.ly, s),
  }));
}

/** True when at least one row has a value for `key`. */
export const hasValues = <K extends string>(rows: readonly Partial<Record<K, unknown>>[], key: K): boolean => rows.some((r) => r[key] != null);
