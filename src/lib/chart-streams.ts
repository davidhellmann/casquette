// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Chart streams (GLOSSARY): loading a ride's downsampled streams (/streams/<id>.json) and turning them
 * into chart rows – one implementation for the ride page, the dashboard ride analysis and the segment
 * page. Pure apart from the injected `fetch`; unit-tested in chart-streams.test.js.
 */
import { routes } from './routes.ts';

/**
 * A loader for chart streams: `load(id)` resolves to the streams, or null when the ride has none or
 * they fail to load (HTTP error, network error, invalid JSON). Each id is fetched once per loader.
 */
export function chartStreamsLoader({ fetch: get = (...args) => globalThis.fetch(...args) } = {}) {
  const cache = new Map();
  const fetchOnce = async (id) => {
    try {
      const res = await get(routes.streams(id));
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  return {
    load(id) {
      if (!cache.has(id)) cache.set(id, fetchOnce(id));
      return cache.get(id);
    },
  };
}

/** The page's loader on the browser's fetch. */
export const chartStreams = chartStreamsLoader();

/** The stream series, top to bottom: key in the row, key in the Strava stream, unit. */
export const STREAM_SERIES = [
  { key: 'watts', stream: 'watts', unit: 'W' },
  { key: 'hr', stream: 'heart_rate', unit: 'bpm' },
  { key: 'cad', stream: 'cadence', unit: 'rpm' },
  { key: 'kmh', stream: 'velocity', unit: 'km/h' },
  { key: 'alt', stream: 'altitude', unit: 'm' },
];
/** Series that `smooth` evens out (noisy second-by-second signals). */
const SMOOTHED = new Set(['watts', 'cad']);

const present = (arr, n) => Array.isArray(arr) && arr.length >= n && arr.some((v) => v != null && v !== 0);

/** Centred moving average over ±`r` samples, nulls skipped (display only). */
export function rollingMean(values, r = 3) {
  return values.map((_, i) => {
    let sum = 0, k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) if (values[j] != null) { sum += values[j]; k++; }
    return k ? sum / k : null;
  });
}

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
 * Chart rows of a ride's streams, downsampled for display only (the data stays as it is): each row
 * has i (sample index, for the map), t (s), km, and one value per series in `keys` (speed in km/h).
 * `max` caps the rows (min-max decimation of the primary series); `smooth` > 0 evens out power and
 * cadence over ±`smooth` samples before decimation. Missing or all-zero series are left out.
 */
export function streamRows(st, { max = 800, smooth = 0 } = {}) {
  if (!st || !Array.isArray(st.time) || st.time.length < 2) return { rows: [], keys: [] };
  const n = st.time.length;
  const series = STREAM_SERIES.filter((s) => present(st[s.stream], n))
    .map((s) => ({ ...s, values: smooth > 0 && SMOOTHED.has(s.key) ? rollingMean(st[s.stream], smooth) : st[s.stream] }));
  const keys = series.map((s) => s.key);
  const primary = (series.find((s) => s.key === 'watts') ?? series.find((s) => s.key === 'hr') ?? series.find((s) => s.key === 'alt'))?.values ?? null;
  const rows = displayIndices(primary, n, max).map((i) => {
    const row = { i, t: st.time[i], km: st.distance?.[i] != null ? st.distance[i] / 1000 : null };
    for (const s of series) {
      const v = s.values[i];
      row[s.key] = v == null ? null : s.key === 'kmh' ? +(v * 3.6).toFixed(1) : v;
    }
    return row;
  });
  return { rows, keys };
}
