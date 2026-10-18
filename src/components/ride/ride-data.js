/**
 * Pure data for the ride page (src/pages/rides/[id].astro → RideView): the route and stream colouring
 * and the power curve rows (stream rows: src/lib/chart-streams.js). No DOM, no React – unit-tested in ride-data.test.js.
 */
import { zoneIdx } from '../../training/index.js';

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
