/**
 * One place for how a data meaning looks in a chart: colour token and line shape.
 *
 * Colour by role (DESIGN.md "Colour"): the primary series is pink (`--brand`); a reference
 * (all-time best, FTP, best so far) is ink (`--foreground`); a comparison (previous year, earlier
 * period) or context (bars behind a line) is grey (`--muted-foreground`). Own colours only where
 * power and heart rate of one ride share a chart. The functional exception: in a ride's streams,
 * power and heart rate are coloured by the zone of every value (`zoned`, zone tokens).
 *
 * Shape: round where the data is aggregated or smoothed by definition, hard where every point is
 * a real measurement, steps for values that hold until they change. Monotone, never
 * "natural"/"basis": a smoothed line must not overshoot the real values.
 */
export type Curve = 'monotone' | 'linear' | 'stepAfter';

export interface SeriesStyle {
  color: string;
  curve: Curve;
  /** stroke-dasharray for comparison/reference series */
  dash?: string;
  /** Coloured by the zone of each value where the chart knows the zones (ride streams); `color` stands in where it cannot. */
  zoned?: boolean;
}

const v = (token: string) => `var(--${token})`;

const PRIMARY = v('brand');
const REFERENCE = v('foreground');
const COMPARE = v('muted-foreground');

export const SERIES = {
  // Fitness & fatigue: fitness is the primary line, fatigue a dashed grey, form in status colours
  fitness: { color: PRIMARY, curve: 'monotone' },
  fatigue: { color: COMPARE, curve: 'linear', dash: '4 3' },
  formPositive: { color: v('positive'), curve: 'linear' },
  formNegative: { color: v('negative'), curve: 'linear' },
  // KPI sparklines (always pink, see KpiCard – the key only picks the shape): aggregated per bucket
  rides: { color: PRIMARY, curve: 'monotone' },
  time: { color: PRIMARY, curve: 'monotone' },
  distance: { color: PRIMARY, curve: 'monotone' },
  elevation: { color: PRIMARY, curve: 'monotone' },
  power: { color: PRIMARY, curve: 'monotone' },
  heartRate: { color: PRIMARY, curve: 'monotone' },
  load: { color: PRIMARY, curve: 'monotone' },
  prs: { color: PRIMARY, curve: 'monotone' },
  // Totals per month/year: distance as pink bars, hours as an ink line, the year before dashed grey
  hours: { color: REFERENCE, curve: 'monotone' },
  distanceCompare: { color: COMPARE, curve: 'monotone', dash: '4 3' },
  // Performance: rolling / per-month bests are aggregated (best20 is drawn as bars; as a line it is monotone)
  eftp: { color: PRIMARY, curve: 'monotone' },
  best20: { color: COMPARE, curve: 'monotone' },
  wkg: { color: PRIMARY, curve: 'monotone' },
  // Power curves (best values over duration) – monotone keeps them honest
  curveAllTime: { color: REFERENCE, curve: 'monotone' },
  curveRecent: { color: PRIMARY, curve: 'monotone' },
  curveCompare: { color: COMPARE, curve: 'monotone', dash: '4 3' },
  curvePeriod: { color: PRIMARY, curve: 'monotone' },
  curveSecondHalf: { color: COMPARE, curve: 'monotone', dash: '4 3' },
  curveRide: { color: PRIMARY, curve: 'monotone' },
  // Dashboard: per-ride averages (power vs heart rate need their own colours), rolling trends, cumulative totals
  ridePower: { color: v('power'), curve: 'monotone' },
  rideHeartRate: { color: v('heart-rate'), curve: 'monotone' },
  efficiencyTrend: { color: PRIMARY, curve: 'monotone' },
  cumulative: { color: PRIMARY, curve: 'monotone' },
  // Measurements, point by point – the streams of one ride: power and heart rate in their zone colours
  // (form follows function), cadence, speed and elevation as grey context
  streamPower: { color: v('power'), curve: 'linear', zoned: true },
  streamHeartRate: { color: v('heart-rate'), curve: 'linear', zoned: true },
  streamCadence: { color: COMPARE, curve: 'linear' },
  streamSpeed: { color: COMPARE, curve: 'linear' },
  streamElevation: { color: COMPARE, curve: 'linear' },
  segmentAttempt: { color: PRIMARY, curve: 'linear' },
  segmentWatts: { color: PRIMARY, curve: 'linear' }, // drawn as a scatter (one dot per attempt)
  // Values that hold until they change
  ftp: { color: REFERENCE, curve: 'stepAfter', dash: '2 3' },
  weight: { color: COMPARE, curve: 'stepAfter' },
  segmentBest: { color: REFERENCE, curve: 'stepAfter', dash: '4 3' },
} satisfies Record<string, SeriesStyle>;

export type SeriesKey = keyof typeof SERIES;

/** Earlier years next to the highlighted current one (pink): the rest of the category palette, never zone colours. */
export const COMPARE_COLORS = [2, 3, 6, 4, 5].map((n) => v(`category-${n}`));

/** Zone colour token (1–7). */
export const zoneColor = (zone: number) => v(`zone-${zone}`);

/** Bars: rounded top corners when they stand alone, square when dense (≥ ~60 bars). */
export const barRadius = (count: number): [number, number, number, number] => (count >= 60 ? [0, 0, 0, 0] : [3, 3, 0, 0]);

/** Thin out long daily series for display only (keeps the last point). */
export function thin<T>(points: T[], max = 500, limit = 700): T[] {
  if (points.length <= limit) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

/** Round axis ticks (1, 2, 2.5, 5 × 10ⁿ steps) covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  if (ticks.at(-1)! < max) ticks.push(+(ticks.at(-1)! + step).toFixed(10));
  return ticks;
}
