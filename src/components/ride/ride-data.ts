/**
 * Pure data for the ride page (src/pages/rides/[id].astro → RideView): the route and stream colouring
 * and the power curve rows (stream rows: src/lib/chart-streams.ts). No DOM, no React – unit-tested in ride-data.test.ts.
 */
import { zoneIdx } from '../../training/index.ts';
import type { LatLng } from './RideMap';

/** A route point: from the summary polyline, or from the chart streams (null or unknown coordinates where a sample has no position). */
export type RoutePoint = LatLng | readonly [number | null, number | null] | null;

/** A drawable route point (the sync writes both coordinates or neither, so the latitude decides). */
export const isLatLng = (p: RoutePoint | undefined): p is LatLng => !!p && Number.isFinite(p[0]);

/** Zone boundaries as the colouring reads them (lower bounds count). */
type ZoneBounds = readonly { min: number | null; max?: number | null }[];
/** A run of route points in one zone (0 = no zone colouring). */
export interface ZoneRun {
  zone: number;
  points: LatLng[];
}
/** A zone band of a stream chart: from/to as fractions of its height (0 = top). */
export interface ZoneBand {
  zone: number;
  from: number;
  to: number;
}
type Curve = Record<string, number | null>;

const zoneOf = (v: number, zones: ZoneBounds) => zoneIdx(v, zones) + 1;

/**
 * The route split into runs of the same zone (each run shares its first point with the previous one's
 * last, so the line has no gaps). Without values/zones the whole route is one run of zone 0.
 */
export function zoneRuns(points: readonly RoutePoint[], values: readonly (number | null)[] | null, zones: ZoneBounds | null): ZoneRun[] {
  const runs: ZoneRun[] = [];
  let cur: ZoneRun | null = null;
  points.forEach((p, i) => {
    if (!isLatLng(p)) return;
    const v = values ? values[i] : null;
    const z = values && zones ? (v != null ? zoneOf(v, zones) : cur ? cur.zone || 1 : 1) : 0;
    if (!cur || z !== cur.zone) {
      const last = cur?.points.at(-1);
      const next: ZoneRun = { zone: z, points: last ? [last] : [] };
      runs.push(next);
      cur = next;
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
export function zoneBands(zones: ZoneBounds | null | undefined, lo: number, hi: number): ZoneBand[] {
  if (!zones?.length || !(hi > lo)) return [];
  const at = (v: number) => (hi - v) / (hi - lo);
  const bands: ZoneBand[] = [];
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
export function rideCurveData(
  { own = {}, year = {}, allTime = {}, wkg = {} }: { own?: Curve; year?: Curve; allTime?: Curve; wkg?: { own?: Curve; year?: Curve; allTime?: Curve } },
) {
  const points = Object.keys(own).map(Number).flatMap((s) => {
    const w = own[s];
    return s >= 5 && w != null ? [{ s, w }] : [];
  }).sort((a, b) => a.s - b.s);
  const at = (o: Curve | undefined, s: number) => o?.[s] ?? null;
  return points.map(({ s, w }) => ({
    s,
    ride: w, rideWkg: at(wkg.own, s),
    year: at(year, s), yearWkg: at(wkg.year, s),
    all: at(allTime, s), allWkg: at(wkg.allTime, s),
  }));
}
