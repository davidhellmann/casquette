/** Training metrics computed from Strava streams (per-second data) and the activity summary. */
import { eachInterval, hrDistribution, isMeasured as measured, powerDistribution } from '../../src/ride/distribution.js';

/** Storage boundary: old cache records must not reintroduce frozen athlete-dependent values. */
export function storedMetrics(metrics) {
  const { intensity_factor, tss, avg_wkg, np_wkg, ftp_used, ...out } = metrics;
  if (out.time_in_power_zones && !out.time_in_power_zones_basis) {
    out.time_in_power_zones_basis = { source: 'legacy', ftp: ftp_used ?? null, zones: null, exact: false };
  }
  return out;
}

/** Per-metric provenance, not the presence of any stream, controls refreshing.
 * Legacy non-summary NP is ambiguous: preserve it, never infer from a power curve.
 */
export function currentMetrics(activity, metrics) {
  if (!metrics) return computeMetrics(activity, null);
  const source = metrics.metric_sources?.np ?? (metrics.source === 'summary' ? 'summary' : null);
  if (source !== 'summary' && source !== 'streams') return metrics;
  const { np, variability_index, efficiency_factor, metric_sources, ...independent } = metrics;
  const updated = powerScalars(activity, source === 'streams' ? np : summaryPower(activity), source);
  const { np: oldNP, variability_index: oldVI, efficiency_factor: oldEF, ...otherSources } = metric_sources || {};
  return { ...independent, ...updated, metric_sources: { ...otherSources, ...updated.metric_sources } };
}

const CURVE_DURATIONS = [1, 5, 10, 15, 20, 30, 60, 120, 180, 300, 480, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800];

const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

const summaryPower = a => a.device_watts && measured(a.weighted_average_watts) ? a.weighted_average_watts : null;

function powerScalars(a, np, source) {
  // Keep the fallback policy even when the current summary has no NP.
  const m = { metric_sources: { np: source } };
  if (measured(np)) {
    m.np = np;
    if (a.device_watts && Number.isFinite(a.average_watts) && a.average_watts > 0) {
      m.variability_index = round(np / a.average_watts, 3);
      m.metric_sources.variability_index = 'np+summary';
    }
    if (Number.isFinite(a.average_heartrate) && a.average_heartrate > 0) {
      m.efficiency_factor = round(np / a.average_heartrate, 3);
      m.metric_sources.efficiency_factor = 'np+summary';
    }
  }
  return m;
}

/** 1 Hz series under the stream sampling rule (eachInterval): each interval repeats its value per
 * second; null marks missing samples and separates gaps. The first sample counts as one second. */
export function to1Hz(time, values) {
  const out = [];
  if (!time || !values || !time.length) return out;
  out.push(Number.isFinite(time[0]) && measured(values[0]) ? values[0] : null);
  eachInterval(time, values,
    (v, dt) => { for (let k = 0; k < dt; k++) out.push(v); },
    (v, i) => { if (Number.isFinite(time[i])) out.push(null, v); else out.push(null); });
  return out;
}

/** Mean maximal power per duration (power curve). */
function powerCurve(w1, durations = CURVE_DURATIONS) {
  const n = w1.length;
  const pre = new Float64Array(n + 1), missing = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    pre[i + 1] = pre[i] + (measured(w1[i]) ? w1[i] : 0);
    missing[i + 1] = missing[i] + (measured(w1[i]) ? 0 : 1);
  }
  const res = {};
  for (const d of durations) {
    if (d > n) break;
    let best = null;
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
export function normalizedPower(w1) {
  let s = 0, run = 0, run4 = 0, runCount = 0, sum4 = 0, cnt = 0;
  for (let i = 0; i <= w1.length; i++) {
    if (!measured(w1[i])) {
      if (run >= 60) { sum4 += run4; cnt += runCount; }
      s = run = run4 = runCount = 0;
      continue;
    }
    s += w1[i]; run++;
    if (run > 30) s -= w1[i - 30];
    if (run >= 30) { run4 += (s / 30) ** 4; runCount++; }
  }
  return cnt ? Math.round((sum4 / cnt) ** 0.25) : null;
}

/** Aerobic decoupling (Pa:HR) – EF of 1st vs. 2nd half, in %. Only for rides ≥ 40 min. */
function decoupling(time, watts, hr) {
  if (!time || !watts || !hr || !time.length) return null;
  const T = time[time.length - 1];
  if (T < 2400) return null;
  const half = T / 2, a = { w: 0, h: 0 }, b = { w: 0, h: 0 };
  for (let i = 0; i < time.length; i++) {
    if (hr[i] == null || watts[i] == null || hr[i] < 60) continue;
    const o = time[i] < half ? a : b;
    o.w += watts[i]; o.h += hr[i];
  }
  if (!a.h || !b.h || !a.w) return null;
  const e1 = a.w / a.h, e2 = b.w / b.h;
  return round(((e1 - e2) / e1) * 100, 1);
}

/** Heart rate curve (max. average HR per duration) – useful for threshold estimates. */
function hrCurve(h1) {
  return powerCurve(h1, [60, 300, 1200, 3600]);
}

/**
 * Metrics for a ride. `streams` = Strava streams (key_by_type) or null.
 * Without streams they are computed from the summary (NP ≈ weighted_average_watts).
 * Zone-independent: time in zones is computed at build time from the power and HR distributions.
 */
export function computeMetrics(activity, streams) {
  const a = activity;
  const t = streams && streams.time && streams.time.data;
  const w = streams && streams.watts && streams.watts.data;
  const h = streams && streams.heartrate && streams.heartrate.data;
  const m = { source: t ? 'streams' : 'summary' };
  const distribution = powerDistribution(t, w);
  if (distribution) m.power_distribution = distribution;

  let np = null;
  if (t && w && w.some((x) => Number.isFinite(x) && x >= 0)) {
    const w1 = to1Hz(t, w);
    np = normalizedPower(w1);
    m.power_curve = powerCurve(w1);
    m.decoupling_pct = h ? decoupling(t, w, h) : null;
  }
  if (t && h && h.some((x) => x > 0)) {
    // HR time in zones is computed at build time from the zones on the ride date (zones file or Strava).
    const hrDist = hrDistribution(t, h);
    if (hrDist) m.hr_distribution = hrDist;
    m.hr_curve = hrCurve(to1Hz(t, h));
  }
  return { ...m, ...powerScalars(a, np ?? summaryPower(a), np == null ? 'summary' : 'streams') };
}

/** Condense streams to ~target points for display (bucket averages). */
export function downsampleStreams(streams, target = 1000) {
  const time = streams && streams.time && streams.time.data;
  if (!time || !time.length) return null;
  const keys = { watts: 'watts', heartrate: 'heart_rate', cadence: 'cadence', altitude: 'altitude', velocity_smooth: 'velocity', distance: 'distance' };
  const dec = { altitude: 0, velocity: 1, distance: 0 };
  const n = time.length, buckets = Math.min(n, target), step = n / buckets;
  const out = { points: buckets, original_points: n, time: [] };
  const src = {};
  for (const [k, name] of Object.entries(keys)) if (streams[k] && streams[k].data) { src[name] = streams[k].data; out[name] = []; }
  const ll = streams.latlng && streams.latlng.data;
  if (ll) out.latlng = [];
  for (let b = 0; b < buckets; b++) {
    const i0 = Math.floor(b * step), i1 = Math.max(i0 + 1, Math.floor((b + 1) * step));
    out.time.push(time[i0]);
    for (const [name, arr] of Object.entries(src)) {
      let s = 0, c = 0;
      for (let i = i0; i < i1 && i < n; i++) if (arr[i] != null) { s += arr[i]; c++; }
      out[name].push(c ? round(s / c, dec[name] ?? 0) : null);
    }
    if (ll) { const p = ll[i0]; out.latlng.push(p ? [round(p[0], 4), round(p[1], 4)] : null); }
  }
  return out;
}
