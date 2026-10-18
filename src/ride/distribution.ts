// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Power and HR distributions: FTP- and zone-independent pairs of value and seconds from raw streams,
 * enough to compute time in zones for any zone bounds at build time. Pure, no I/O.
 */
import { zoneIdx } from '../training/index.ts';

const METHOD = 'right-sample-dt-0-10s';

/** A real measurement: finite and not negative (0 W and 0 bpm included). */
export const isMeasured = (v) => Number.isFinite(v) && v >= 0;

/**
 * The sampling rule of raw streams (METHOD), the single owner for distributions and 1 Hz series:
 * the right-hand sample owns (previous time, time]. Steps of 0 < dt <= 10 s are intervals; their
 * value is `null` when the sample is missing or invalid. Steps above 10 s, negative or unknown are
 * gaps; dt = 0 adds nothing. No interpolation across gaps.
 * @param {(value: number|null, dt: number, i: number) => void} interval
 * @param {(value: number|null, i: number) => void} [gap] value of the sample after the gap
 */
export function eachInterval(time, values, interval, gap = () => {}) {
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const value = isMeasured(values[i]) ? values[i] : null;
    if (!Number.isFinite(dt) || dt < 0 || dt > 10) gap(value, i);
    else if (dt > 0) interval(value, dt, i);
  }
}

/** Lossless for TIZ under the sampling rule, NOT a continuous signal.
 * No value rounding/buckets: future zone boundaries can be applied without approximation.
 */
function sampleDistribution(time, values) {
  if (!time || !values) return null;
  const seconds = new Map();
  eachInterval(time, values, (v, dt) => { if (v !== null) seconds.set(v, (seconds.get(v) || 0) + dt); });
  return seconds.size ? { version: 1, method: METHOD, samples: [...seconds].sort((a, b) => a[0] - b[0]) } : null;
}

/** Power distribution: watts → seconds. */
export const powerDistribution = (time, watts) => sampleDistribution(time, watts);
/** HR distribution: bpm → seconds. */
export const hrDistribution = (time, heartrate) => sampleDistribution(time, heartrate);

/** Seconds per zone from a power or HR distribution; `null` for an unknown or invalid distribution. */
export function distributionTiz(distribution, zones) {
  if (distribution?.version !== 1 || distribution.method !== METHOD || !zones?.length ||
    !Array.isArray(distribution.samples) || !distribution.samples.length) return null;
  const out = Array(zones.length).fill(0);
  for (const pair of distribution.samples) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [v, seconds] = pair;
    if (!Number.isFinite(v) || v < 0 || !Number.isFinite(seconds) || seconds <= 0) return null;
    out[zoneIdx(v, zones)] += seconds;
  }
  return out;
}
