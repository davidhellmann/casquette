/**
 * Power and HR distributions: FTP- and zone-independent pairs of value and seconds from raw streams,
 * enough to compute time in zones for any zone bounds at build time. Pure, no I/O.
 */
import { zoneIdx } from '../training/index.ts';
import type { ZoneSet } from '../training/index.ts';

const METHOD = 'right-sample-dt-0-10s';

/**
 * A power or HR distribution as stored in the ride file: `[value, seconds]` pairs sorted by value
 * (watts or bpm). The build only accepts `version: 1` with the sampling rule `METHOD`
 * ('right-sample-dt-0-10s'); anything else counts as no distribution.
 */
export interface Distribution {
  version: number;
  method: string;
  samples: [value: number, seconds: number][];
}

/** Power distribution: watts → seconds (GLOSSARY "Power distribution"). */
export type PowerDistribution = Distribution;
/** HR distribution: bpm → seconds (GLOSSARY "HR distribution"). */
export type HrDistribution = Distribution;

/** A raw stream: one value per sample; missing samples may be null. */
type Stream = ArrayLike<number | null | undefined>;

/** A real measurement: finite and not negative (0 W and 0 bpm included). */
export const isMeasured = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * The sampling rule of raw streams (METHOD), the single owner for distributions and 1 Hz series:
 * the right-hand sample owns (previous time, time]. Steps of 0 < dt <= 10 s are intervals; their
 * value is `null` when the sample is missing or invalid. Steps above 10 s, negative or unknown are
 * gaps; dt = 0 adds nothing. No interpolation across gaps.
 * @param interval called per interval with its value, length in seconds and sample index
 * @param gap called per gap with the value of the sample after the gap
 */
export function eachInterval(
  time: Stream, values: Stream,
  interval: (value: number | null, dt: number, i: number) => void,
  gap: (value: number | null, i: number) => void = () => {},
): void {
  for (let i = 1; i < time.length; i++) {
    const dt = Number(time[i]) - Number(time[i - 1]);
    const v = values[i];
    const value = isMeasured(v) ? v : null;
    if (!Number.isFinite(dt) || dt < 0 || dt > 10) gap(value, i);
    else if (dt > 0) interval(value, dt, i);
  }
}

/** Lossless for TIZ under the sampling rule, NOT a continuous signal.
 * No value rounding/buckets: future zone boundaries can be applied without approximation.
 */
function sampleDistribution(time: Stream | null | undefined, values: Stream | null | undefined): Distribution | null {
  if (!time || !values) return null;
  const seconds = new Map<number, number>();
  eachInterval(time, values, (v, dt) => { if (v !== null) seconds.set(v, (seconds.get(v) || 0) + dt); });
  return seconds.size ? { version: 1, method: METHOD, samples: [...seconds].sort((a, b) => a[0] - b[0]) } : null;
}

/** Power distribution: watts → seconds. */
export const powerDistribution = (time: Stream | null | undefined, watts: Stream | null | undefined): PowerDistribution | null =>
  sampleDistribution(time, watts);
/** HR distribution: bpm → seconds. */
export const hrDistribution = (time: Stream | null | undefined, heartrate: Stream | null | undefined): HrDistribution | null =>
  sampleDistribution(time, heartrate);

/**
 * Seconds per zone from a power or HR distribution; `null` for an unknown or invalid distribution.
 * `distribution` is stored data and is validated here, so anything may be passed.
 */
export function distributionTiz(distribution: unknown, zones: ZoneSet | null | undefined): number[] | null {
  if (typeof distribution !== 'object' || distribution === null || !zones?.length) return null;
  // Parse seam: stored data, every field is checked below.
  const { version, method, samples } = distribution as Partial<Record<keyof Distribution, unknown>>;
  if (version !== 1 || method !== METHOD || !Array.isArray(samples) || !samples.length) return null;
  const out: number[] = Array(zones.length).fill(0);
  for (const pair of samples) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [v, seconds]: unknown[] = pair;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
    out[zoneIdx(v, zones)] += seconds;
  }
  return out;
}
