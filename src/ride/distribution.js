/**
 * Power and HR distributions: FTP- and zone-independent pairs of value and seconds from raw streams,
 * enough to compute time in zones for any zone bounds at build time. Pure, no I/O.
 */
import { zoneIdx } from '../training/index.js';

const METHOD = 'right-sample-dt-0-10s';

/** Lossless for TIZ under the existing raw-stream integration rule, NOT a continuous signal.
 * Right sample owns (previous time, time]; skip gaps >10s, missing/invalid values and dt<=0.
 * No value rounding/buckets: future zone boundaries can be applied without approximation.
 */
function sampleDistribution(time, values) {
  if (!time || !values) return null;
  const seconds = new Map();
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1], v = values[i];
    if (!Number.isFinite(dt) || dt <= 0 || dt > 10 || !Number.isFinite(v) || v < 0) continue;
    seconds.set(v, (seconds.get(v) || 0) + dt);
  }
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
