/**
 * Pure data for the ride page (src/pages/rides/[id].astro → RideView): stream rows for display,
 * the power curve rows and the route colouring. No DOM, no React – unit-tested in ride-data.test.js.
 */
import { zoneIdx } from '../../training/index.js';

/** The stream charts, top to bottom: key in the row, key in the Strava stream, unit. */
export const STREAM_SERIES = [
  { key: 'watts', stream: 'watts', unit: 'W' },
  { key: 'hr', stream: 'heart_rate', unit: 'bpm' },
  { key: 'cad', stream: 'cadence', unit: 'rpm' },
  { key: 'kmh', stream: 'velocity', unit: 'km/h' },
  { key: 'alt', stream: 'altitude', unit: 'm' },
];

const present = (arr, n) => Array.isArray(arr) && arr.length >= n && arr.some((v) => v != null && v !== 0);

/**
 * Indices to draw from `n` samples, at most ~`max`: per bucket the minimum and the maximum of the
 * primary series, so spikes survive (min-max decimation). First and last sample always included.
 */
export function displayIndices(primary, n, max = 800) {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const buckets = Math.max(1, Math.floor(max / 2));
  const size = n / buckets;
  const out = [0];
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size), to = Math.min(n, Math.floor((b + 1) * size));
    if (to <= from) continue;
    if (!primary) { out.push(from); continue; }
    let lo = -1, hi = -1;
    for (let i = from; i < to; i++) {
      const v = primary[i];
      if (v == null) continue;
      if (lo < 0 || v < primary[lo]) lo = i;
      if (hi < 0 || v > primary[hi]) hi = i;
    }
    if (lo < 0) out.push(from);
    else if (lo === hi) out.push(lo);
    else out.push(Math.min(lo, hi), Math.max(lo, hi));
  }
  out.push(n - 1);
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Rows for the stream charts, downsampled for display only (the data stays as it is).
 * Each row: i (sample index, for the map), t (s), km, and one value per series in `keys`.
 */
export function streamRows(st, max = 800) {
  if (!st || !Array.isArray(st.time) || st.time.length < 2) return { rows: [], keys: [] };
  const n = st.time.length;
  const series = STREAM_SERIES.filter((s) => present(st[s.stream], n));
  const keys = series.map((s) => s.key);
  const primary = st.watts && present(st.watts, n) ? st.watts : st.heart_rate || st.altitude || null;
  const rows = displayIndices(primary, n, max).map((i) => {
    const row = { i, t: st.time[i], km: st.distance?.[i] != null ? st.distance[i] / 1000 : null };
    for (const s of series) {
      const v = st[s.stream][i];
      row[s.key] = v == null ? null : s.key === 'kmh' ? +(v * 3.6).toFixed(1) : v;
    }
    return row;
  });
  return { rows, keys };
}

/** Centred moving average (radius `r` samples), nulls skipped – evens out the route colouring. */
export function rollingMean(values, r = 3) {
  return values.map((_, i) => {
    let sum = 0, k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) if (values[j] != null) { sum += values[j]; k++; }
    return k ? sum / k : null;
  });
}

const zoneOf = (v, zones) => zoneIdx(v, zones) + 1;

/**
 * The route split into runs of the same zone (each run shares its first point with the previous one's
 * last, so the line has no gaps). Without values/zones the whole route is one run of zone 0.
 */
export function zoneRuns(points, values, zones) {
  const runs = [];
  let cur = null;
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p[0])) return;
    const v = values ? values[i] : null;
    const z = values && zones ? (v != null ? zoneOf(v, zones) : cur ? cur.zone || 1 : 1) : 0;
    if (!cur || z !== cur.zone) {
      const last = cur?.points.at(-1);
      cur = { zone: z, points: last ? [last] : [] };
      runs.push(cur);
    }
    cur.points.push(p);
  });
  return runs.filter((r) => r.points.length > 1);
}

/**
 * The zones a stream chart's value axis [lo, hi] shows, top to bottom, as fractions of its height
 * (0 = top = hi, 1 = bottom = lo) – the hard stops of a vertical gradient that colours the line by the
 * zone of every value. A value belongs to the highest zone whose `min` it reaches (as zoneIdx).
 */
export function zoneBands(zones, lo, hi) {
  if (!zones?.length || !(hi > lo)) return [];
  const at = (v) => (hi - v) / (hi - lo);
  const bands = [];
  for (let i = zones.length - 1, top = hi; i >= 0 && top > lo; i--) {
    const start = i === 0 ? -Infinity : zones[i].min || 0;
    if (start >= top) continue;
    const bottom = Math.max(start, lo);
    bands.push({ zone: i + 1, from: at(top), to: at(bottom) });
    top = bottom;
  }
  return bands;
}

/**
 * Power curve of a ride against the year's and the all-time bests (other rides), durations ≥ 5 s
 * where the ride has a value. W/kg per curve from the rides' own weights.
 */
export function rideCurveData({ own = {}, year = {}, allTime = {}, wkg = {} }) {
  const secs = Object.keys(own).map(Number).filter((s) => s >= 5 && own[s] != null).sort((a, b) => a - b);
  const at = (o, s) => (o && o[s] != null ? o[s] : null);
  return secs.map((s) => ({
    s,
    ride: own[s], rideWkg: at(wkg.own, s),
    year: at(year, s), yearWkg: at(wkg.year, s),
    all: at(allTime, s), allWkg: at(wkg.allTime, s),
  }));
}
