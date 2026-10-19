import { thin } from '../charts/series.ts';
import type { DecodedPeriod } from '../../lib/dashboard-payload.ts';

/**
 * Fitness, fatigue & form chart rows for the dashboard period: one row per day, values rounded to
 * the shown precision. Long periods are thinned for display only.
 */
export function fitnessChartData(D: Pick<DecodedPeriod, 'pmc'>): { day: string; d: Date; ctl: number; atl: number; tsb: number; load: number }[] {
  return thin(D.pmc).map((x) => ({ day: x.day, d: x.d, ctl: +x.ctl.toFixed(1), atl: +x.atl.toFixed(1), tsb: +x.tsb.toFixed(1), load: x.load }));
}
