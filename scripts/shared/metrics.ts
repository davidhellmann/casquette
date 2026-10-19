/** Training metrics computed from Strava streams (per-second data) and the activity summary. */
import { eachInterval, hrDistribution, isMeasured, powerDistribution } from '../../src/ride/distribution.ts';
import type { Zone } from './athlete-file.ts';

// TODO(ts-b1): use src/ride type (the distribution of src/ride/distribution.ts)
/** Power or HR distribution: pairs of value and seconds, sorted by value. */
export type Distribution = { version: number; method: string; samples: [number, number][] };

/** Best average per duration in seconds (power curve, HR curve). */
export type Curve = Record<number, number>;

/** Where a stored NP comes from: computable raw streams or the Strava summary. */
export type MetricSource = 'streams' | 'summary';

/** Per-metric provenance; VI and EF combine the stored NP with the current summary. */
export type MetricSources = { np?: MetricSource; variability_index?: 'np+summary'; efficiency_factor?: 'np+summary' };

/** Boundaries of stored (legacy) time in zones: power with the FTP of the sync, HR with the zones of the sync day. */
export type StoredTizBasis = { source: 'legacy' | 'sync'; ftp?: number | null; zones?: readonly Zone[] | null; exact?: boolean };

/** Athlete-dependent values older syncs stored; `storedMetrics` removes them. */
type LegacyMetrics = { intensity_factor?: number | null; tss?: number | null; avg_wkg?: number | null; np_wkg?: number | null; ftp_used?: number | null };

/** Metrics of a ride as the activity cache and the ride file store them: zone-independent, plus legacy time in zones. */
export type RideMetrics = LegacyMetrics & {
  /** `streams` when a time stream was present, not proof of stream NP (see `metric_sources`). */
  source?: MetricSource;
  np?: number | null;
  variability_index?: number | null;
  efficiency_factor?: number | null;
  metric_sources?: MetricSources;
  power_curve?: Curve;
  hr_curve?: Curve;
  decoupling_pct?: number | null;
  power_distribution?: Distribution;
  hr_distribution?: Distribution;
  time_in_power_zones?: number[];
  time_in_power_zones_basis?: StoredTizBasis;
  time_in_hr_zones?: number[];
  time_in_hr_zones_basis?: StoredTizBasis;
  computed_at?: string;
};

/** Stored metrics without the legacy athlete-dependent values. */
export type StoredMetrics = Omit<RideMetrics, keyof LegacyMetrics>;

/** The summary fields the metrics read (a Strava summary or a cached one). */
export type MetricsActivity = {
  device_watts?: boolean | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  average_heartrate?: number | null;
};

/** One raw stream sample series; `null` marks a missing sample. */
export type StreamSeries = { data: (number | null)[] };

/** Raw streams as Strava sends them with `key_by_type` (the series the metrics and charts read). */
export type RawStreams = {
  time?: { data: number[] };
  watts?: StreamSeries;
  heartrate?: StreamSeries;
  cadence?: StreamSeries;
  altitude?: StreamSeries;
  velocity_smooth?: StreamSeries;
  distance?: StreamSeries;
  latlng?: { data: ([number, number] | null)[] };
};

type ChartSeries = 'watts' | 'heart_rate' | 'cadence' | 'altitude' | 'velocity' | 'distance';

/** Chart streams (one file per ride, read by the charts): bucket averages of the raw streams. */
export type ChartStreams = { points: number; original_points: number; time: number[]; latlng?: ([number | null, number | null] | null)[] }
  & Partial<Record<ChartSeries, (number | null)[]>>;

// TODO(ts-b1): drop once src/ride's isMeasured is a type guard itself.
/** A real measurement (src/ride/distribution.ts owns the rule), as a type guard. */
const measured = (v: number | null | undefined): v is number => isMeasured(v);

// TODO(ts-b1): call src/ride's eachInterval directly once its callbacks are typed (today its `gap` infers as `() => void`).
type EachInterval = (time: readonly number[], values: readonly (number | null)[],
  interval: (value: number | null, dt: number, i: number) => void, gap?: (value: number | null, i: number) => void) => void;
const eachSample = eachInterval as EachInterval;

/** A finite, positive number. */
const positive = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Storage boundary: old cache records must not reintroduce frozen athlete-dependent values. */
export function storedMetrics(metrics: RideMetrics): StoredMetrics {
  const { intensity_factor, tss, avg_wkg, np_wkg, ftp_used, ...out } = metrics;
  if (out.time_in_power_zones && !out.time_in_power_zones_basis) {
    out.time_in_power_zones_basis = { source: 'legacy', ftp: ftp_used ?? null, zones: null, exact: false };
  }
  return out;
}

/** Per-metric provenance, not the presence of any stream, controls refreshing.
 * Legacy non-summary NP is ambiguous: preserve it, never infer from a power curve.
 */
export function currentMetrics(activity: MetricsActivity, metrics: RideMetrics | null | undefined): RideMetrics {
  if (!metrics) return computeMetrics(activity, null);
  const source = metrics.metric_sources?.np ?? (metrics.source === 'summary' ? 'summary' : null);
  if (source !== 'summary' && source !== 'streams') return metrics;
  const { np, variability_index, efficiency_factor, metric_sources, ...independent } = metrics;
  const updated = powerScalars(activity, source === 'streams' ? np : summaryPower(activity), source);
  const { np: oldNP, variability_index: oldVI, efficiency_factor: oldEF, ...otherSources } = metric_sources || {};
  return { ...independent, ...updated, metric_sources: { ...otherSources, ...updated.metric_sources } };
}

const CURVE_DURATIONS = [1, 5, 10, 15, 20, 30, 60, 120, 180, 300, 480, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800];

const round = (v: number | null | undefined, d = 0): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

const summaryPower = (a: MetricsActivity): number | null => (a.device_watts && measured(a.weighted_average_watts) ? a.weighted_average_watts : null);

type PowerScalars = Pick<RideMetrics, 'np' | 'variability_index' | 'efficiency_factor'> & { metric_sources: MetricSources };

function powerScalars(a: MetricsActivity, np: number | null | undefined, source: MetricSource): PowerScalars {
  // Keep the fallback policy even when the current summary has no NP.
  const m: PowerScalars = { metric_sources: { np: source } };
  if (measured(np)) {
    m.np = np;
    if (a.device_watts && positive(a.average_watts)) {
      m.variability_index = round(np / a.average_watts, 3);
      m.metric_sources.variability_index = 'np+summary';
    }
    if (positive(a.average_heartrate)) {
      m.efficiency_factor = round(np / a.average_heartrate, 3);
      m.metric_sources.efficiency_factor = 'np+summary';
    }
  }
  return m;
}

/** 1 Hz series under the stream sampling rule (eachInterval): each interval repeats its value per
 * second; null marks missing samples and separates gaps. The first sample counts as one second. */
export function to1Hz(time: readonly number[] | null | undefined, values: readonly (number | null)[] | null | undefined): (number | null)[] {
  const out: (number | null)[] = [];
  if (!time || !values || !time.length) return out;
  const first = values[0];
  out.push(Number.isFinite(time[0]) && measured(first) ? first : null);
  eachSample(time, values,
    (v: number | null, dt: number) => { for (let k = 0; k < dt; k++) out.push(v); },
    (v: number | null, i: number) => { if (Number.isFinite(time[i])) out.push(null, v); else out.push(null); });
  return out;
}

/** Mean maximal power per duration (power curve). */
function powerCurve(w1: readonly (number | null)[], durations = CURVE_DURATIONS): Curve {
  const n = w1.length;
  const pre = new Float64Array(n + 1), missing = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = w1[i];
    pre[i + 1] = pre[i] + (measured(v) ? v : 0);
    missing[i + 1] = missing[i] + (measured(v) ? 0 : 1);
  }
  const res: Curve = {};
  for (const d of durations) {
    if (d > n) break;
    let best: number | null = null;
    for (let i = d; i <= n; i++) {
      if (missing[i] !== missing[i - d]) continue;
      const s = pre[i] - pre[i - d];
      if (best == null || s > best) best = s;
    }
    if (best != null) res[d] = Math.round(best / d);
  }
  return res;
}

/** 30 s rolling average only within measured sections of at least 60 s. */
export function normalizedPower(w1: readonly (number | null)[]): number | null {
  let s = 0, run = 0, run4 = 0, runCount = 0, sum4 = 0, cnt = 0;
  for (let i = 0; i <= w1.length; i++) {
    const v = w1[i];
    if (!measured(v)) {
      if (run >= 60) { sum4 += run4; cnt += runCount; }
      s = run = run4 = runCount = 0;
      continue;
    }
    s += v; run++;
    // Inside a measured run of more than 30 samples, the sample 30 back is measured, too.
    if (run > 30) s -= w1[i - 30] as number;
    if (run >= 30) { run4 += (s / 30) ** 4; runCount++; }
  }
  return cnt ? Math.round((sum4 / cnt) ** 0.25) : null;
}

/** Aerobic decoupling (Pa:HR) – EF of 1st vs. 2nd half, in %. Only for rides ≥ 40 min. */
function decoupling(time: readonly number[], watts: readonly (number | null)[], hr: readonly (number | null)[]): number | null {
  if (!time || !watts || !hr || !time.length) return null;
  const T = time[time.length - 1];
  if (T < 2400) return null;
  const half = T / 2, a = { w: 0, h: 0 }, b = { w: 0, h: 0 };
  for (let i = 0; i < time.length; i++) {
    const h = hr[i], w = watts[i];
    if (h == null || w == null || h < 60) continue;
    const o = time[i] < half ? a : b;
    o.w += w; o.h += h;
  }
  if (!a.h || !b.h || !a.w) return null;
  const e1 = a.w / a.h, e2 = b.w / b.h;
  return round(((e1 - e2) / e1) * 100, 1);
}

/** Heart rate curve (max. average HR per duration) – useful for threshold estimates. */
function hrCurve(h1: readonly (number | null)[]): Curve {
  return powerCurve(h1, [60, 300, 1200, 3600]);
}

/**
 * Metrics for a ride. `streams` = Strava streams (key_by_type) or null.
 * Without streams they are computed from the summary (NP ≈ weighted_average_watts).
 * Zone-independent: time in zones is computed at build time from the power and HR distributions.
 */
export function computeMetrics(activity: MetricsActivity, streams: RawStreams | null | undefined): RideMetrics {
  const a = activity;
  const t = streams?.time?.data;
  const w = streams?.watts?.data;
  const h = streams?.heartrate?.data;
  const m: RideMetrics = { source: t ? 'streams' : 'summary' };
  const distribution: Distribution | null = powerDistribution(t, w);
  if (distribution) m.power_distribution = distribution;

  let np: number | null = null;
  if (t && w && w.some(measured)) {
    const w1 = to1Hz(t, w);
    np = normalizedPower(w1);
    m.power_curve = powerCurve(w1);
    m.decoupling_pct = h ? decoupling(t, w, h) : null;
  }
  if (t && h && h.some((x) => x !== null && x > 0)) {
    // HR time in zones is computed at build time from the zones on the ride date (zones file or Strava).
    const hrDist: Distribution | null = hrDistribution(t, h);
    if (hrDist) m.hr_distribution = hrDist;
    m.hr_curve = hrCurve(to1Hz(t, h));
  }
  return { ...m, ...powerScalars(a, np ?? summaryPower(a), np == null ? 'summary' : 'streams') };
}

/** Raw stream → chart series, in the order they are written. */
const CHART_SERIES: [Exclude<keyof RawStreams, 'time' | 'latlng'>, ChartSeries][] = [
  ['watts', 'watts'], ['heartrate', 'heart_rate'], ['cadence', 'cadence'], ['altitude', 'altitude'], ['velocity_smooth', 'velocity'], ['distance', 'distance'],
];
/** Decimals per chart series (default 0). */
const DECIMALS: Partial<Record<ChartSeries, number>> = { altitude: 0, velocity: 1, distance: 0 };

/** Condense streams to ~target points for display (bucket averages). */
export function downsampleStreams(streams: RawStreams | null | undefined, target = 1000): ChartStreams | null {
  const time = streams?.time?.data;
  if (!streams || !time || !time.length) return null;
  const n = time.length, buckets = Math.min(n, target), step = n / buckets;
  const out: ChartStreams = { points: buckets, original_points: n, time: [] };
  const src: { name: ChartSeries; values: (number | null)[]; series: (number | null)[] }[] = [];
  for (const [k, name] of CHART_SERIES) {
    const values = streams[k]?.data;
    if (values) { const series: (number | null)[] = []; out[name] = series; src.push({ name, values, series }); }
  }
  const ll = streams.latlng?.data;
  const latlng: ([number | null, number | null] | null)[] = [];
  if (ll) out.latlng = latlng;
  for (let b = 0; b < buckets; b++) {
    const i0 = Math.floor(b * step), i1 = Math.max(i0 + 1, Math.floor((b + 1) * step));
    out.time.push(time[i0]);
    for (const { name, values, series } of src) {
      let s = 0, c = 0;
      for (let i = i0; i < i1 && i < n; i++) { const v = values[i]; if (v != null) { s += v; c++; } }
      series.push(c ? round(s / c, DECIMALS[name] ?? 0) : null);
    }
    if (ll) { const p = ll[i0]; latlng.push(p ? [round(p[0], 4), round(p[1], 4)] : null); }
  }
  return out;
}
