// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Pure data for the segment detail page (src/components/segments/SegmentView.tsx).
 * An attempt: { ride, name, date: 'YYYY-MM-DD', t: elapsed seconds, w, hr, pr } in date order.
 */

/** Chart rows: every attempt with the best time up to and including it (`i` = position). */
export function attemptRows(efforts) {
  let best = Infinity;
  return efforts.map((e, i) => ({ ...e, i, best: (best = Math.min(best, e.t)) }));
}

/** The attempts that set a new best time, newest first; `gain` = seconds faster than the previous best. */
export function prHistory(efforts) {
  const out = [];
  let best = Infinity;
  for (const e of efforts) {
    if (e.t >= best) continue;
    out.push({ ride: e.ride, name: e.name, date: e.date, t: e.t, gain: best === Infinity ? null : best - e.t });
    best = e.t;
  }
  return out.reverse();
}

/** Watts vs. time: the attempts with power (whole watts); empty below two points. */
export function wattsPoints(efforts) {
  const pts = efforts.filter((e) => e.w > 0).map((e) => ({ ...e, w: Math.round(e.w) }));
  return pts.length < 2 ? [] : pts;
}

/**
 * Cut a segment out of a ride's (thinned) stream file. `track.si`/`track.ei` are indexes into the
 * original stream; `points`/`original_points` scale them to the thinned one.
 * @returns {{ latlng: [number, number][], profile: { km: number, alt: number }[] } | null} null without a route
 */
export function segmentTrack(stream, track, distance) {
  if (!stream?.latlng) return null;
  const n = stream.latlng.length;
  const k = (stream.points || n) / (stream.original_points || n);
  const i0 = Math.max(0, Math.floor(track.si * k));
  const i1 = Math.min(n - 1, Math.ceil(track.ei * k));
  const latlng = stream.latlng.slice(i0, i1 + 1).filter(Boolean);
  if (latlng.length < 2) return null;
  const alt = stream.altitude ? stream.altitude.slice(i0, i1 + 1) : [];
  const dist = stream.distance ? stream.distance.slice(i0, i1 + 1) : [];
  const d0 = dist[0] || 0;
  const metres = (i) => (dist.length ? (dist[i] || 0) - d0 : (i / alt.length) * distance);
  const profile = alt.map((a, i) => ({ km: Math.round(metres(i)) / 1000, alt: a })).filter((p) => p.alt != null);
  return { latlng, profile };
}

const CLOCK_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Time axis (seconds): round clock steps (… 15 s, 30 s, 1 min, 2 min, 5 min …) covering the values, about `count` ticks. */
export function timeTicks(values, count = 5) {
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / (count - 1);
  const step = CLOCK_STEPS.find((s) => s >= raw) ?? Math.ceil(raw / 3600) * 3600;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v < max + step; v += step) ticks.push(v);
  return { ticks, domain: [ticks[0], ticks.at(-1)] };
}
