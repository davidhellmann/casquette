/**
 * Synthetic demo dataset (Refs #13, #25): a fictional "travelling rider" with bikes and ~3 years
 * of rides on real roads in Munich, London, Paris, New York and Vancouver – so a fresh clone
 * shows a populated dashboard.
 *
 * - Fully synthetic and seeded: the same seed always produces byte-identical files. Nothing is
 *   derived from real rides. Routes are hand-picked waypoints (scripts/site/lib/demo-cities.ts),
 *   routed once along real streets and cached in demo/source/routes/ (OpenStreetMap data, ODbL –
 *   see demo-route-cache.ts). The generator only reads that cache and never uses the network.
 * - The rider spends a few weeks at a time in each city; every outdoor ride starts and ends at
 *   the rider's base there. Places (`geo:`), segments, time zones and altitude follow the route.
 * - Rides go through the same ride file module and metrics as the sync (computeMetrics,
 *   ride-file.ts, downsampleStreams), so the files match the real schema exactly.
 * - Pure: returns data, writes nothing. `scripts/site/generate-demo.ts` writes it to demo/.
 */
import { computeMetrics, downsampleStreams, normalizedPower, to1Hz } from '../../shared/metrics.ts';
import type { ChartStreams, RawStreams } from '../../shared/metrics.ts';
import { rideBody, rideFileName, rideFrontmatter, rideText } from '../../shared/ride-file.ts';
import type {
  ActivitySummary, LatLng, RideFileRecord, RideGeo, RideLap, RidePlace, RideSegmentEffort, RideSplit,
} from '../../shared/ride-file.ts';
import type { WrittenRideFrontmatter } from '../../shared/ride-file.ts';
import type { ZonesFile } from '../../../src/training/index.ts';
import type { Goal } from '../../../src/scripts/goals.ts';
import { athleteFile, historyEntry } from '../../shared/athlete-file.ts';
import type { AthleteFile, Gear, HistoryEntry, Zone } from '../../shared/athlete-file.ts';
import { toYaml } from '../../shared/yaml.ts';
import { cogganZones } from '../../../src/training/index.ts';
import { CITIES } from './demo-cities.ts';
import type { DemoCity, DemoPlace, DemoRouteSpec, DemoSegmentSpec } from './demo-cities.ts';
import type { DemoMeta } from './demo-dataset.ts';
import { encodePolyline, loadRouteCache, metres, ROUTE_ATTRIBUTION } from './demo-route-cache.ts';
import type { LoadedRoute } from './demo-route-cache.ts';
import { ROOT } from '../../shared/env.ts';

/** A ride file of the demo dataset: path below demo/, frontmatter and ride body. */
export type DemoRideFile = { file: string; data: WrittenRideFrontmatter; body: string };

/** The custom block of a demo gear file (what a rider adds by hand). */
export type DemoGearCustom = { purchase_date: string | null; price_eur: number; components: string[]; color: string; notes: string | null };

/** A gear file of the demo dataset: path below demo/, frontmatter and body. */
export type DemoGearFile = {
  file: string;
  data: Gear & { strava_url: null; synced_at: string; custom: DemoGearCustom };
  body: string;
};

/** The files below demo/data/. */
export type DemoDataFiles = {
  'athlete.json': AthleteFile;
  'goals.json': Goal[];
  'fitness-history.json': HistoryEntry[];
  'zones.json': ZonesFile;
  'meta.json': DemoMeta;
};

/** The generated demo dataset (generateDemoData), written to demo/ by renderDemoFiles. */
export type DemoData = {
  rides: DemoRideFile[];
  gear: DemoGearFile[];
  /** Chart streams per ride id. */
  streams: Record<string, ChartStreams | null>;
  data: DemoDataFiles;
};

/** generateDemoData options: seed, last day, number of weeks, and the routes (default: demo/source/routes/). */
export type GenerateDemoOptions = { seed?: number; through?: string; weeks?: number; routeCache?: Record<string, LoadedRoute> | null };

/** The seeded random source of the generator. */
type Rng = {
  next: () => number;
  range: (lo: number, hi: number) => number;
  int: (lo: number, hi: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
  normal: () => number;
};

export const DEFAULT_SEED = 13;
/** Last day of generated rides. Fixed (not "today") so the output never depends on the clock;
 * the app moves demo dates forward at runtime (src/lib/demo-clock.ts). */
export const DEFAULT_THROUGH = '2026-10-16';
export const DEFAULT_WEEKS = 156;
/** Points per stored stream (the sync stores up to 1000; the demo stays compact). */
const STREAM_POINTS = 240;
/** The rider's home town (athlete profile). */
const HOME_CITY = 'munich';

/* ---------------- Seeded randomness ---------------- */
function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    normal: () => {
      const u = Math.max(next(), 1e-9), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return r;
}

/** `v` rounded to `d` decimals; null counts as 0 (as in Math.round(null)). */
const round = (v: number | null, d = 0) => Math.round((v ?? 0) * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundPoint = ([lat, lng]: LatLng, d: number): LatLng => [round(lat, d), round(lng, d)];
const DAY = 86400000;
const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcDay = (day: string) => Date.parse(`${day}T00:00:00Z`);

/* ---------------- Routes on real roads ---------------- */
/** Resampling step along a route (km). */
const STEP_KM = 0.02;
/** Elevation smoothing (± samples): SRTM is noisy on bridges and in cuttings. */
const SMOOTH = 6;

/** A route resampled along its roads: positions, distances (km) and smoothed elevation per sample. */
type Route = DemoRouteSpec & {
  city: DemoCity; vertices: LatLng[]; vdist: number[]; xy: LatLng[]; dist: number[]; elev: number[]; lengthKm: number;
};
/** The roads one ride follows (ridePath), with its encoded polyline. */
type RidePath = Route & { polyline: string };
/** A segment with its distance, grade and category measured on the roads. */
type CanonicalSegment = DemoSegmentSpec & { distance: number; average_grade: number; climb_category: number; city: string };
/** A segment one ride passes: where it starts and ends on the ride (km). */
type SegmentOnRide = Omit<CanonicalSegment, 'from' | 'to'> & { from: number; to: number };
/** A city with its resampled routes and measured segments. */
type CityData = Omit<DemoCity, 'routes' | 'segments'> & { routes: Route[]; segments: CanonicalSegment[] };

/** Cached vertices → cumulative distance (km). */
function vertexDistances(points: readonly LatLng[]): number[] {
  const dist = [0];
  for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + metres(points[i - 1], points[i]) / 1000);
  return dist;
}

/** Value of `arr` (per point) at distance `km` along `dist`, linearly interpolated. */
function interp(dist: readonly number[], arr: readonly LatLng[], km: number): LatLng;
function interp(dist: readonly number[], arr: readonly number[], km: number): number;
function interp(dist: readonly number[], arr: readonly LatLng[] | readonly number[], km: number): LatLng | number;
function interp(dist: readonly number[], arr: readonly LatLng[] | readonly number[], km: number): LatLng | number {
  let lo = 0, hi = dist.length - 1;
  if (km <= 0) return arr[0];
  if (km >= dist[hi]) return arr[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dist[mid] <= km) lo = mid; else hi = mid; }
  const f = (km - dist[lo]) / (dist[hi] - dist[lo] || 1);
  const a = arr[lo], b = arr[hi];
  if (Array.isArray(a) && Array.isArray(b)) return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * f;
  throw new Error('interp: points and values mixed in one series');
}

/** One cached route → uniformly resampled track with smoothed elevation. */
function buildRoute(spec: DemoRouteSpec, cached: LoadedRoute, city: DemoCity): Route {
  const vdist = vertexDistances(cached.points);
  const lengthKm = vdist.at(-1)!;
  const n = Math.max(2, Math.round(lengthKm / STEP_KM));
  const xy: LatLng[] = [], dist: number[] = [], raw: number[] = [];
  for (let i = 0; i <= n; i++) {
    const km = (lengthKm * i) / n;
    dist.push(km); xy.push(interp(vdist, cached.points, km)); raw.push(interp(vdist, cached.elevation, km));
  }
  const elev = raw.map((_, i) => mean(raw, Math.max(0, i - SMOOTH), Math.min(raw.length, i + SMOOTH + 1))!);
  return { ...spec, city, vertices: cached.points, vdist, xy, dist, elev, lengthKm };
}

/** The roads one ride follows: the whole loop, or out to `turn` (share of the way out) and back. */
function ridePath(route: Route, turn = 1): RidePath {
  if (route.kind !== 'out-back') return { ...route, polyline: encodePolyline(route.vertices) };
  const cut = route.lengthKm * turn;
  const i1 = route.dist.findIndex((d) => d >= cut - 1e-9);
  const end = i1 < 0 ? route.dist.length - 1 : i1;
  const outXy = route.xy.slice(0, end + 1), outElev = route.elev.slice(0, end + 1), outDist = route.dist.slice(0, end + 1);
  const total = outDist.at(-1)!;
  const xy = [...outXy, ...outXy.slice(0, -1).reverse()];
  const elev = [...outElev, ...outElev.slice(0, -1).reverse()];
  const dist = [...outDist, ...outDist.slice(0, -1).reverse().map((d) => 2 * total - d)];
  const v = route.vertices.filter((_, i) => route.vdist[i] < total);
  const tip = outXy.at(-1)!;
  const way = [...v, tip];
  return { ...route, xy, elev, dist, lengthKm: 2 * total, polyline: encodePolyline([...way, ...way.slice(0, -1).reverse()]) };
}

function at(path: Route, arr: readonly LatLng[], km: number): LatLng;
function at(path: Route, arr: readonly number[], km: number): number;
function at(path: Route, arr: readonly LatLng[] | readonly number[], km: number): LatLng | number { return interp(path.dist, arr, km); }
const gradeAt = (path: Route, km: number) => (at(path, path.elev, km + 0.05) - at(path, path.elev, km - 0.05)) / 100;

/* ---------------- Places ---------------- */
/** The gazetteer place a point belongs to: closest relative to the place's radius. */
function placeAt(city: Pick<DemoCity, 'places'>, p: LatLng): DemoPlace | null {
  let best: DemoPlace | null = null, score = 1;
  for (const pl of city.places) {
    const s = metres(p, pl.at) / 1000 / pl.r;
    if (s < score) { score = s; best = pl; }
  }
  return best;
}

/** `geo:` block of a ride – the same shape the sync's reverse geocoding produces. */
function geoOf(path: RidePath, city: CityData): RideGeo {
  const list: (RidePlace & { region: string })[] = [];
  for (let km = 0; km <= path.lengthKm; km += 0.25) {
    const pl = placeAt(city, at(path, path.xy, km));
    if (pl && !list.some((x) => x.name === pl.name)) list.push({ name: pl.name, region: pl.region, country: city.country });
  }
  return { start: list[0].name, region: list[0].region, country: city.country, countries: [city.country], regions: [...new Set(list.map((p) => p.region))], places: list };
}

/* ---------------- Segments ---------------- */
const SNAP_M = 60;
const climbCategory = (m: number, grade: number) => { const s = m * grade; return s > 80000 ? 5 : s > 64000 ? 4 : s > 32000 ? 3 : s > 16000 ? 2 : s > 8000 ? 1 : 0; };

/** Where a ride passes segment `seg` (start, then end, in that order): { from, to } in km, or null. */
function locate(path: RidePath, seg: DemoSegmentSpec, maxKm: number): { from: number; to: number } | null {
  const near = (p: LatLng, q: LatLng) => metres(p, q) <= SNAP_M;
  for (let i = 0; i < path.xy.length; i++) {
    if (!near(path.xy[i], seg.from)) continue;
    // closest sample to the start within this pass
    let i0 = i;
    while (i0 + 1 < path.xy.length && metres(path.xy[i0 + 1], seg.from) < metres(path.xy[i0], seg.from)) i0++;
    // first pass by the end point (closest sample of that pass)
    for (let j = i0 + 1; j < path.xy.length && path.dist[j] - path.dist[i0] <= maxKm; j++) {
      if (!near(path.xy[j], seg.to)) continue;
      while (j + 1 < path.xy.length && metres(path.xy[j + 1], seg.to) < metres(path.xy[j], seg.to)) j++;
      // the last pass by the start before that (a route may pass the start twice)
      let k = j - 1;
      while (k > i0 && !near(path.xy[k], seg.from)) k--;
      while (k > i0 && metres(path.xy[k - 1], seg.from) < metres(path.xy[k], seg.from)) k--;
      return { from: path.dist[k], to: path.dist[j] };
    }
    while (i < path.xy.length && near(path.xy[i], seg.from)) i++; // try the next pass
  }
  return null;
}

/** Canonical segment data (distance, grade, category) from the first route that rides it. */
function canonicalSegments(city: DemoCity, routes: readonly Route[]): CanonicalSegment[] {
  return city.segments.map((seg) => {
    for (const route of routes) {
      const path = ridePath(route);
      const hit = locate(path, seg, 30);
      if (!hit) continue;
      const meters = (hit.to - hit.from) * 1000;
      const gain = at(path, path.elev, hit.to) - at(path, path.elev, hit.from);
      const grade = round((gain / meters) * 100, 1);
      return { ...seg, distance: round(meters, 1), average_grade: grade, climb_category: climbCategory(meters, grade), city: placeAt(city, seg.from)?.name ?? city.name };
    }
    throw new Error(`Segment ${seg.id} is not on any route of ${city.name}.`);
  });
}

/** Segments one ride passes, with their position (km) on the ride. */
function segmentsOn(path: RidePath, segments: readonly CanonicalSegment[]): SegmentOnRide[] {
  const out: SegmentOnRide[] = [];
  for (const seg of segments) {
    const hit = locate(path, seg, (seg.distance / 1000) * 1.3 + 0.2);
    if (hit) out.push({ ...seg, from: hit.from, to: hit.to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/* ---------------- Physics ---------------- */
const MASS = 88, CRR = 0.005, CDA = 0.38, RHO = 1.05, G = 9.81;
/** Steady-state speed (m/s) for power `p` on `grade` (bisection on the power balance). */
function speedFor(p: number, grade: number, crr = CRR): number {
  const need = (v: number) => 0.5 * RHO * CDA * v ** 3 + (crr * MASS * G + MASS * G * grade) * v;
  let lo = 0.5, hi = 19;
  if (need(hi) <= p * 0.97) return hi;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (need(mid) > p * 0.97) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/* ---------------- Time zone ---------------- */
const TZ_FMT = new Map<string, Intl.DateTimeFormat>();
/** UTC offset (seconds) of `timeZone` at the local wall time `localISO`. */
function utcOffset(localISO: string, timeZone: string): number {
  if (!TZ_FMT.has(timeZone)) TZ_FMT.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }));
  const offsetAt = (ms: number) => {
    const name = TZ_FMT.get(timeZone)!.formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName')!.value; // GMT-07:00 or GMT
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60) : 0;
  };
  const asUtc = Date.parse(`${localISO}Z`);
  return offsetAt(asUtc - offsetAt(asUtc) * 1000);
}

/* ---------------- Travel ---------------- */
/** Which city the rider is in, week by week: stints of 5–11 weeks, every city once per round. */
function travelPlan(r: Rng, startMs: number, endMs: number): (ms: number) => string {
  const stints: { from: number; city: string }[] = [];
  let order: string[] = [];
  for (let t = startMs; t <= endMs; t += r.int(5, 11) * 7 * DAY) {
    if (!order.length) {
      order = CITIES.map((c) => c.key);
      for (let i = order.length - 1; i > 0; i--) { const j = r.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
      if (stints.length && order[0] === stints.at(-1)!.city) order.push(order.shift()!);
    }
    stints.push({ from: t, city: order.shift()! });
  }
  return (ms) => stints.filter((s) => s.from <= ms).at(-1)!.city;
}

/* ---------------- Athlete ---------------- */
const HR_ZONES: Zone[] = [{ min: 0, max: 128 }, { min: 129, max: 146 }, { min: 147, max: 160 }, { min: 161, max: 172 }, { min: 173, max: null }];
const HR_REST = 52, HR_MAX = 186;
/** Zones file of the demo: the rider set lower HR zones by hand for the first part, then took Strava's current ones. */
const lowerBounds = (zones: readonly Zone[]) => zones.map((z) => z.min);
const EARLY_HR_BPM = [0, 124, 142, 156, 168];
/** Share of the demo period after which the current HR zones apply. */
const HR_ZONES_CHANGE = 0.4;

function fitnessHistory(startMs: number, endMs: number): HistoryEntry[] {
  const steps: [ftp: number, weight: number][] = [[225, 79.5], [232, 78.6], [240, 77.9], [236, 78.4], [247, 77.0], [255, 76.1], [251, 76.6], [262, 75.2], [268, 74.6]];
  const n = steps.length;
  return steps.map(([ftp, weight], i) => {
    const day = dayStr(startMs + Math.round(((endMs - startMs - 20 * DAY) * i) / (n - 1)) + 3 * DAY);
    return historyEntry({ day, ftp, weight, source: i % 3 === 1 ? 'strava' : 'manual', note: i === 0 ? 'Starting value' : i % 3 === 1 ? 'Change detected in Strava' : 'FTP test (20 min)' });
  });
}
/** FTP of a history entry – every demo entry has one. */
function ftpOf(entry: HistoryEntry): number {
  if (entry.ftp === null) throw new Error(`Demo history entry ${entry.date} has no FTP.`);
  return entry.ftp;
}
const standAt = (history: readonly HistoryEntry[], day: string) => {
  let cur = history[0];
  for (const h of history) if (h.date <= day) cur = h;
  return cur;
};

/** A demo bike: its gear fields, when it is ridden (share of the period, `from`…`to`), custom block and body. */
type DemoBike = {
  id: string; name: string; brand: string; model: string; frame_type: string; weight: number; power: boolean; from: number; to: number;
  retired?: boolean; primary?: boolean; indoor?: boolean; custom: DemoGearCustom; body: string;
};

const GEAR: DemoBike[] = [
  { id: 'bdemo1', name: 'Steel Classic', brand: 'Fernweh', model: 'Randonneur 8', frame_type: 'Road', weight: 10.4, power: false, from: 0, to: 0.22, retired: true,
    custom: { purchase_date: '2016-05-14', price_eur: 1450, components: ['Shimano 105 2x10', 'Hand-built 32h wheels'], color: 'British racing green', notes: 'First proper road bike. Retired after the carbon bike arrived.' },
    body: 'A steel randonneur with fenders and a front bag. Slow, comfortable and nearly indestructible.' },
  { id: 'bdemo2', name: 'Carbon Endurance', brand: 'Velomax', model: 'Endura SL', frame_type: 'Road', weight: 8.1, power: true, from: 0.2, to: 1, primary: true,
    custom: { purchase_date: null, price_eur: 3890, components: ['Shimano Ultegra Di2 2x12', 'Crank-based power meter', 'Carbon 45 mm wheels'], color: 'Matte graphite', notes: 'Main bike for road rides.' },
    body: 'Endurance geometry, 30 mm tyres and a power meter. The bike for everything with tarmac.' },
  { id: 'bdemo3', name: 'Gravel All-Road', brand: 'Dustline', model: 'Gravelo 2', frame_type: 'Gravel', weight: 9.6, power: false, from: 0, to: 1,
    custom: { purchase_date: '2022-09-03', price_eur: 2190, components: ['SRAM Rival 1x12', '45 mm gravel tyres'], color: 'Sand', notes: null },
    body: 'Used for dirt roads and the occasional bikepacking trip.' },
  { id: 'bdemo4', name: 'Indoor Trainer', brand: 'Velomax', model: 'Basebike', frame_type: 'Road', weight: 9.0, power: true, from: 0, to: 1, indoor: true,
    custom: { purchase_date: '2021-11-20', price_eur: 1100, components: ['Smart trainer (direct drive)'], color: 'Black', notes: 'Lives on the trainer all year.' },
    body: 'An old frame that never leaves the smart trainer.' },
];

/* ---------------- Workouts ---------------- */
/** One workout step: name, duration (s) and share of FTP. */
type WorkoutStep = [name: string, seconds: number, share: number];
type Workout = { name: string; steps: WorkoutStep[] };

const WORKOUTS: Workout[] = [
  { name: 'Endurance spin', steps: [['Warm-up', 600, 0.55], ['Endurance', 3000, 0.68], ['Cool-down', 480, 0.5]] },
  { name: 'Sweet spot 3×12', steps: [['Warm-up', 720, 0.55], ...[1, 2, 3].flatMap((i): WorkoutStep[] => [[`Sweet spot ${i}`, 720, 0.9], ['Recovery', 300, 0.5]]), ['Cool-down', 420, 0.5]] },
  { name: 'VO2max 5×4', steps: [['Warm-up', 900, 0.58], ...[1, 2, 3, 4, 5].flatMap((i): WorkoutStep[] => [[`Interval ${i}`, 240, 1.15], ['Recovery', 240, 0.5]]), ['Cool-down', 600, 0.5]] },
  { name: 'Threshold 2×20', steps: [['Warm-up', 900, 0.58], ['Threshold 1', 1200, 0.97], ['Recovery', 420, 0.5], ['Threshold 2', 1200, 0.96], ['Cool-down', 540, 0.5]] },
  { name: 'Tempo 45', steps: [['Warm-up', 600, 0.58], ['Tempo', 2700, 0.82], ['Cool-down', 480, 0.5]] },
  { name: 'Recovery spin', steps: [['Easy', 2400, 0.5]] },
];
const FTP_TEST: Workout = { name: 'FTP test (20 min)', steps: [['Warm-up', 1200, 0.6], ['Opener', 300, 1.08], ['Recovery', 600, 0.5], ['20 min test', 1200, 1.055], ['Cool-down', 600, 0.5]] };

const DESCRIPTIONS = [
  'Legs felt fresh today. Kept it steady and enjoyed the quiet roads.',
  'Strong headwind on the way out, fast way home.',
  'Coffee stop halfway, as always.',
  'Tested the new saddle position – feels better on the climbs.',
  'Drizzle all morning, so I kept it short.',
  'Rode with the Saturday group. Fast pace on the flats.',
  'First ride after a week off. Took it easy.',
  'Perfect autumn light on the way back.',
  'Puncture after the gravel section, second half was all about catching up.',
  'Hit the climb hard for once and it paid off.',
];

/* ---------------- Simulation ---------------- */
/** Synthetic watts in 5-W steps: keeps the stored power distribution (one pair per distinct value) compact. */
const quantize = (p: number) => Math.round(p / 5) * 5;

/** A simulated ride: 1-second streams (latlng and altitude outdoors only, laps indoors only). */
type Sim = {
  time: number[]; distance: number[]; velocity: number[]; cadence: number[];
  watts: (number | null)[] | null; heart: (number | null)[] | null;
  laps?: { name: string; start: number; end: number }[];
} & ({ latlng: LatLng[]; altitude: number[] } | { latlng?: undefined; altitude?: undefined });

/** One ride as Strava would report it: raw 1-second streams plus per-sample bookkeeping. */
function simulateOutdoor(route: RidePath, r: Rng, { ftp, intensity, power, hr, hardSegments, segments, gravel }: {
  ftp: number; intensity: number; power: boolean; hr: boolean; hardSegments: boolean; segments: readonly SegmentOnRide[]; gravel: boolean;
}): Sim {
  const drift = r.range(4, 11);
  const crr = gravel ? 0.0075 : CRR;
  const total = route.lengthKm * 1000;
  const time: number[] = [], distance: number[] = [], latlng: LatLng[] = [], altitude: number[] = [], velocity: number[] = [];
  const watts: (number | null)[] = [], heart: (number | null)[] = [], cadence: number[] = [];
  let s = 0, t = 0, v = 4, h = HR_REST + 20, noise = 0, coast = 0;
  while (s < total && t < 6 * 3600 * 2) {
    const km = s / 1000;
    const grade = gradeAt(route, km);
    const inSeg = hardSegments && segments.some((g) => km >= g.from && km <= g.to && g.climb_category > 0 && g.distance < 5000);
    noise = noise * 0.92 + r.normal() * 0.035;
    if (coast > 0) coast--; else if (r.chance(0.004)) coast = r.int(4, 25);
    let target = ftp * (intensity + Math.min(0.2, 0.045 * grade * 100) + noise); // long mountain climbs are paced, not raced
    if (grade < -0.02) target = ftp * Math.max(0, intensity - 0.12 * -grade * 100 + noise);
    if (inSeg) target = Math.max(target, ftp * r.range(1.0, 1.1));
    if (r.chance(0.002)) target *= 2.2; // short surge
    let p = coast > 0 ? 0 : clamp(target, 0, ftp * 3.4);
    if (km < 0.3 || km > route.lengthKm - 0.2) p *= 0.6;
    const vt = p > 5 ? speedFor(p, grade, crr) : Math.min(16, Math.max(v * 0.985, grade < -0.01 ? speedFor(0.01, grade, crr) : 2));
    v += (vt - v) * 0.2;
    // Cardiac drift: heart rate creeps up over time at constant power (→ positive Pa:HR decoupling).
    const hrTarget = HR_REST + (HR_MAX - HR_REST) * clamp(0.38 + 0.5 * (p / ftp), 0.3, 1) + (t / 3600) * drift;
    h += (hrTarget - h) / 28 + r.normal() * 0.3;
    time.push(t); distance.push(round(s, 1));
    latlng.push(roundPoint(at(route, route.xy, km), 5));
    altitude.push(round(at(route, route.elev, km), 1));
    velocity.push(round(v, 2));
    watts.push(power ? quantize(p) : null);
    heart.push(hr ? Math.round(clamp(h, 60, HR_MAX + 2)) : null);
    cadence.push(p > 15 ? Math.round(clamp(88 - grade * 120 + r.normal() * 3, 55, 115)) : 0);
    s += v; t++;
  }
  return { time, distance, latlng, altitude, velocity, watts: power ? watts : null, heart: hr ? heart : null, cadence };
}

function simulateIndoor(r: Rng, { ftp, steps, hr }: { ftp: number; steps: readonly WorkoutStep[]; hr: boolean }): Sim & { laps: NonNullable<Sim['laps']> } {
  const time: number[] = [], distance: number[] = [], velocity: number[] = [], watts: number[] = [], heart: (number | null)[] = [], cadence: number[] = [];
  const laps: NonNullable<Sim['laps']> = [];
  let s = 0, t = 0, v = 7, h = HR_REST + 15;
  for (const [name, dur, pct] of steps) {
    const lapStart = t;
    for (let i = 0; i < dur; i++) {
      const p = Math.max(0, ftp * pct * (1 + r.normal() * 0.025));
      const vt = speedFor(Math.max(p, 10), 0);
      v += (vt - v) * 0.15;
      const hrTarget = HR_REST + (HR_MAX - HR_REST) * clamp(0.38 + 0.5 * (p / ftp), 0.3, 1) + (t / 3600) * 4;
      h += (hrTarget - h) / 30 + r.normal() * 0.3;
      time.push(t); distance.push(round(s, 1)); velocity.push(round(v, 2));
      watts.push(quantize(p));
      heart.push(hr ? Math.round(clamp(h, 60, HR_MAX + 2)) : null);
      cadence.push(Math.round(clamp(90 + r.normal() * 2.5, 70, 110)));
      s += v; t++;
    }
    laps.push({ name, start: lapStart, end: t - 1 });
  }
  return { time, distance, velocity, watts, heart: hr ? heart : null, cadence, laps };
}

type Series = readonly (number | null | undefined)[];
const mean = (arr: Series, i0 = 0, i1 = arr.length) => { let sum = 0, n = 0; for (let i = i0; i < i1; i++) { const x = arr[i]; if (x != null) { sum += x; n++; } } return n ? sum / n : null; };
const max = (arr: Series, i0 = 0, i1 = arr.length) => { let m: number | null = null; for (let i = i0; i < i1; i++) { const x = arr[i]; if (x != null && (m == null || x > m)) m = x; } return m; };
const gainOf = (alt: readonly number[], i0 = 0, i1 = alt.length) => { let g = 0; for (let i = i0 + 1; i < i1; i++) if (alt[i] > alt[i - 1]) g += alt[i] - alt[i - 1]; return g; };
const firstIndex = (distance: readonly number[], m: number) => { const i = distance.findIndex((d) => d >= m); return i < 0 ? distance.length - 1 : i; };

function lapOf(sim: Sim, i0: number, i1: number, extra: { name: string; lap_index: number; split: number; start_date_local: string }): RideLap {
  const dist = sim.distance[i1] - sim.distance[i0], secs = i1 - i0;
  return {
    ...extra, elapsed_time: secs, moving_time: secs, distance: round(dist, 1),
    total_elevation_gain: sim.altitude ? round(gainOf(sim.altitude, i0, i1 + 1), 1) : 0,
    average_speed: round(dist / Math.max(1, secs), 3), max_speed: round(max(sim.velocity, i0, i1 + 1), 2),
    average_cadence: round(mean(sim.cadence, i0, i1 + 1), 1),
    average_watts: sim.watts ? round(mean(sim.watts, i0, i1 + 1), 1) : undefined, device_watts: !!sim.watts,
    average_heartrate: sim.heart ? round(mean(sim.heart, i0, i1 + 1), 1) : undefined, max_heartrate: sim.heart ? max(sim.heart, i0, i1 + 1) : undefined,
    start_index: i0, end_index: i1,
  };
}

/** Strava's Relative Effort, approximated from minutes per heart rate zone. */
function relativeEffort(heart: Series | null): number | null {
  if (!heart) return null;
  const w = [0.4, 0.9, 1.6, 2.6, 3.5];
  let sum = 0;
  for (const b of heart) if (b != null) { let z = HR_ZONES.length - 1; while (z > 0 && b < HR_ZONES[z].min) z--; sum += w[z] / 60; }
  return Math.round(sum);
}

/* ---------------- Schedule ---------------- */
/** A planned ride day: a ride (on a weekend or not, in a season 0…1) or an FTP test (indoors). */
type PlannedRide = { day: string; kind: 'ride' | 'test'; weekend?: boolean; season?: number };

function plan(r: Rng, { startMs, endMs, history }: { startMs: number; endMs: number; history: readonly HistoryEntry[] }): PlannedRide[] {
  const rides: PlannedRide[] = [];
  const testDays = new Set(history.filter((h) => h.note!.startsWith('FTP test')).map((h) => h.date));
  for (let week = startMs; week <= endMs; week += 7 * DAY) {
    const doy = (new Date(week).getUTCMonth() * 30.5 + new Date(week).getUTCDate());
    const season = 0.5 + 0.5 * Math.sin(((doy - 105) / 365) * 2 * Math.PI); // 0 in January, 1 in July
    const n = clamp(Math.round(0.55 + 1.8 * season + r.normal() * 0.55), 0, 4);
    const weekdays = [5, 6, 1, 3, 2, 4, 0]; // Sat, Sun, Tue, Thu, Wed, Fri, Mon (offset from Monday)
    const chosen = weekdays.slice(0, n);
    for (let d = 0; d < 7; d++) {
      const day = dayStr(week + d * DAY);
      if (utcDay(day) > endMs) break;
      if (testDays.has(day)) rides.push({ day, kind: 'test' });
      else if (chosen.includes(d)) rides.push({ day, kind: 'ride', weekend: d >= 5, season });
    }
  }
  return rides;
}

/* ---------------- Dataset ---------------- */
export function generateDemoData({ seed = DEFAULT_SEED, through = DEFAULT_THROUGH, weeks = DEFAULT_WEEKS, routeCache = null }: GenerateDemoOptions = {}): DemoData {
  const r = rng(seed);
  const endMs = utcDay(through);
  const startMs = endMs - ((new Date(endMs).getUTCDay() + 6) % 7) * DAY - (weeks - 1) * 7 * DAY; // a Monday
  const span = endMs - startMs;
  const history = fitnessHistory(startMs, endMs);

  // Real roads per city (cached router output), segments measured on the first route that rides them.
  const cache = routeCache ?? loadRouteCache(ROOT, CITIES.map((c) => c.key));
  const cities: Record<string, CityData> = Object.fromEntries(CITIES.map((city) => {
    const routes = city.routes.map((spec) => buildRoute(spec, cache[spec.key], city));
    return [city.key, { ...city, routes, segments: canonicalSegments(city, routes) }];
  }));
  const cityAt = travelPlan(r, startMs, endMs);
  // Each city's routes take turns, so every route gets ridden a few times.
  const turns = new Map<string, number>();
  const nextRoute = (cityKey: string, kind: string, list: readonly Route[]) => {
    const k = `${cityKey}|${kind}`;
    const i = (turns.get(k) ?? r.int(0, list.length - 1)) + 1;
    turns.set(k, i);
    return list[i % list.length];
  };

  const gearAt = (frac: number, indoor: boolean, gravel: boolean) => GEAR.find((g) => !!g.indoor === indoor && (gravel ? g.frame_type === 'Gravel' : g.frame_type !== 'Gravel') && frac >= g.from && frac < g.to + 1e-9);
  const segBest = new Map<string, number[]>();
  const rides: DemoRideFile[] = [], streams: DemoData['streams'] = {};
  let seq = 0;

  // Streams use their own generator per ride, so tuning the physics never reshuffles the schedule.
  for (const p of plan(r, { startMs, endMs, history })) {
    seq++;
    const frac = (utcDay(p.day) - startMs) / span;
    const city = cities[cityAt(utcDay(p.day))];
    const ftp = ftpOf(standAt(history, p.day));
    // Only test days (always indoors) have no season; their outdoor and temperature draws never happen
    const season = p.season ?? 0.5;
    const winter = p.kind === 'ride' && season < 0.3;
    const indoor = p.kind === 'test' || (winter ? r.chance(0.75) : r.chance(season > 0.7 ? 0.04 : 0.2));
    const ebike = !indoor && r.chance(0.07);
    const hr = !r.chance(0.04);
    const hour = indoor ? r.pick([6, 18, 19]) : p.weekend ? r.int(7, 10) : r.pick([6, 17, 18]);
    const local = `${p.day}T${String(hour).padStart(2, '0')}:${String(r.int(0, 59)).padStart(2, '0')}:${String(r.int(0, 59)).padStart(2, '0')}`;
    const offset = utcOffset(local, city.timezone);
    const startUtc = new Date(Date.parse(`${local}Z`) - offset * 1000).toISOString().replace('.000Z', 'Z');
    const id = `demo-${String(seq).padStart(4, '0')}`;

    let sim: Sim, route: Route | null = null, path: RidePath | null = null, name: string, sport: string, gear: DemoBike | null | undefined = null;
    let trainer = false, laps: RideLap[] = [], segments: RideSegmentEffort[] = [], workout: Workout | null = null, gravel = false;
    if (indoor) {
      workout = p.kind === 'test' ? FTP_TEST : r.pick(WORKOUTS);
      const indoorSim = simulateIndoor(rng(seed * 1000 + seq), { ftp, steps: workout.steps, hr });
      sim = indoorSim;
      sport = r.chance(0.6) ? 'VirtualRide' : 'Ride';
      trainer = sport === 'Ride';
      name = workout.name;
      gear = gearAt(frac, true, false);
      laps = indoorSim.laps.map((l, i) => lapOf(indoorSim, l.start, l.end, { name: l.name, lap_index: i + 1, split: i + 1, start_date_local: shiftLocal(local, l.start) }));
    } else {
      gravel = !ebike && r.chance(season > 0.4 ? 0.22 : 0.35);
      const use = (u: string) => city.routes.filter((x) => x.use === u);
      // Weekend: mostly the long routes, sometimes a shorter one; weekdays: short routes, now and then the commute.
      const kind = ebike ? 'errand' : gravel ? 'gravel' : p.weekend ? (r.chance(0.35) ? 'weekday' : 'weekend') : r.chance(0.12) ? 'errand' : 'weekday';
      let ridden = nextRoute(city.key, kind, use(kind));
      let ride = ridePath(ridden, ridden.kind === 'out-back' ? r.range(...ridden.turn) : 1);
      // No long rides in the cold season: a shorter route instead.
      if (ride.lengthKm > 90 && season < 0.5) {
        ridden = nextRoute(city.key, 'weekday', use('weekday'));
        ride = ridePath(ridden, ridden.kind === 'out-back' ? r.range(...ridden.turn) : 1);
      }
      route = ridden;
      path = ride;
      gear = ebike ? null : gearAt(frac, false, gravel);
      const power = !!gear?.power;
      const rideSegments = segmentsOn(path, city.segments);
      const intensity = route.use === 'errand' ? 0.55 : path.lengthKm > 90 ? r.range(0.58, 0.66) : r.range(0.6, 0.76);
      const outdoorSim = simulateOutdoor(path, rng(seed * 1000 + seq), { ftp, intensity, power, hr, hardSegments: r.chance(0.35), segments: rideSegments, gravel });
      sim = outdoorSim;
      sport = ebike ? 'EBikeRide' : gravel ? 'GravelRide' : 'Ride';
      const tod = hour < 11 ? 'Morning' : hour < 15 ? 'Lunch' : hour < 18 ? 'Afternoon' : 'Evening';
      name = ebike ? 'E-bike errands' : r.chance(0.45) ? route.name : `${tod} Ride`;
      if (route.use === 'errand' && !ebike && r.chance(0.5)) name = 'Commute';
      if (r.chance(0.25) && sim.distance.length > 1) {
        const every = 10000;
        let i0 = 0;
        for (let k = 1; i0 < sim.distance.length - 1; k++) {
          const i1 = k * every >= sim.distance.at(-1)! ? sim.distance.length - 1 : firstIndex(sim.distance, k * every);
          laps.push(lapOf(sim, i0, i1, { name: `Lap ${k}`, lap_index: k, split: k, start_date_local: shiftLocal(local, i0) }));
          i0 = i1;
        }
      }
      segments = rideSegments.map((g) => {
        const i0 = firstIndex(sim.distance, g.from * 1000), i1 = firstIndex(sim.distance, g.to * 1000);
        const elapsed = i1 - i0;
        const prev = segBest.get(g.id) || [];
        const rank = prev.filter((x) => x < elapsed).length + 1;
        segBest.set(g.id, [...prev, elapsed].sort((a, b) => a - b));
        const pr = rank <= 3 && prev.length >= 1 ? rank : null;
        return {
          name: g.name, segment_id: g.id, distance: g.distance, elapsed_time: elapsed, moving_time: elapsed,
          average_watts: sim.watts ? round(mean(sim.watts, i0, i1 + 1), 1) : null, device_watts: sim.watts ? true : null,
          average_heartrate: sim.heart ? round(mean(sim.heart, i0, i1 + 1), 1) : null, max_heartrate: sim.heart ? max(sim.heart, i0, i1 + 1) : null,
          average_cadence: round(mean(sim.cadence, i0, i1 + 1), 1), pr_rank: pr, kom_rank: null,
          average_grade: g.average_grade, climb_category: g.climb_category, city: g.city,
          achievements: pr ? ['pr'] : [], start_index: i0, end_index: i1,
        };
      }).filter((e) => e.elapsed_time > 0);
    }

    const n = sim.time.length;
    const moving = n;
    const stops = indoor ? 0 : moving > 3 * 3600 ? r.int(600, 1800) : r.int(0, 240);
    const dist = sim.distance[n - 1];
    const w = sim.watts;
    const np = w ? normalizedPower(to1Hz(sim.time, w)) : null;
    const avgW = w ? mean(w) : null;
    const estW = !w && !ebike ? Math.round(ftp * 0.6) : null;
    const summary: ActivitySummary = {
      id, name, type: sport, sport_type: sport, workout_type: null,
      start_date: startUtc, start_date_local: local, timezone: `(GMT${offset < 0 ? '-' : '+'}${String(Math.abs(offset) / 3600).padStart(2, '0')}:00) ${city.timezone}`, utc_offset: offset,
      distance: round(dist, 1), moving_time: moving, elapsed_time: moving + stops,
      total_elevation_gain: sim.altitude ? round(gainOf(sim.altitude), 1) : 0,
      elev_high: sim.altitude ? round(max(sim.altitude), 1) : null, elev_low: sim.altitude ? round(-max(sim.altitude.map((x) => -x))!, 1) : null,
      average_speed: round(dist / moving, 3), max_speed: round(max(sim.velocity), 2),
      average_cadence: round(mean(sim.cadence.map((c) => c || null)), 1),
      average_temp: indoor ? null : Math.round(4 + 24 * (p.season ?? 0.5) + r.normal() * 3),
      average_watts: w ? round(avgW, 1) : estW, weighted_average_watts: np, max_watts: w ? max(w) : null,
      kilojoules: w ? round((avgW! * moving) / 1000, 1) : estW ? round((estW * moving) / 1000, 1) : null,
      device_watts: !!w,
      has_heartrate: !!sim.heart, average_heartrate: sim.heart ? round(mean(sim.heart), 1) : null, max_heartrate: sim.heart ? max(sim.heart) : null,
      suffer_score: relativeEffort(sim.heart),
      trainer, commute: name === 'Commute', manual: false, private: false, visibility: 'everyone', flagged: false,
      gear_id: gear?.id || null,
      start_latlng: sim.latlng ? roundPoint(sim.latlng[0], 2) : null, end_latlng: sim.latlng ? roundPoint(sim.latlng[n - 1], 2) : null,
      kudos_count: indoor ? r.int(0, 4) : r.int(1, 14), comment_count: r.chance(0.15) ? r.int(1, 3) : 0,
      athlete_count: !indoor && p.weekend && r.chance(0.25) ? r.int(3, 9) : 1, photo_count: 0, total_photo_count: 0,
      achievement_count: segments.filter((e) => e.pr_rank).length, pr_count: segments.filter((e) => e.pr_rank === 1).length,
      summary_polyline: path ? path.polyline : null,
    };
    const raw: RawStreams = {
      time: { data: sim.time }, distance: { data: sim.distance }, velocity_smooth: { data: sim.velocity }, cadence: { data: sim.cadence },
      ...(w ? { watts: { data: w } } : {}), ...(sim.heart ? { heartrate: { data: sim.heart } } : {}),
      ...(sim.latlng ? { latlng: { data: sim.latlng }, altitude: { data: sim.altitude } } : {}),
    };
    const splits = path && dist <= 35000 ? splitsOf(sim) : [];
    const syncedAt = Date.parse(startUtc) + moving * 1000 + 3600e3;
    const rec: RideFileRecord = {
      id, summary,
      detail: {
        description: r.chance(0.18) ? r.pick(DESCRIPTIONS) : '',
        calories: w ? Math.round(avgW! * moving / 1000 * 1.05) : Math.round((moving / 3600) * (ebike ? 250 : 560)),
        device_name: indoor ? 'Smart trainer' : 'Bike computer',
        perceived_exertion: r.chance(0.2) ? r.int(3, 8) : null,
        gear: gear ? { id: gear.id, name: gear.name } : undefined,
        laps, splits_metric: splits, segment_efforts: segments,
      },
      metrics: computeMetrics(summary, raw),
      geo: path ? geoOf(path, city) : null,
      streamsFile: true,
      _sync: { summary: syncedAt, detail: syncedAt, streams: syncedAt },
    };
    rides.push({ file: `rides/${rideFileName(rec)}`, data: rideFrontmatter(rec, { gearName: gear?.name }), body: rideBody(rec) });
    streams[id] = downsampleStreams(raw, STREAM_POINTS);
  }

  const gearKm = (id: string) => rides.filter((x) => x.data.gear_id === id).reduce((s, x) => s + (x.data.distance || 0), 0);
  const gearList = GEAR.map((g): Gear => ({
    id: g.id, name: g.name, type: 'bike', brand: g.brand, model: g.model, frame_type: g.frame_type, description: null, weight: g.weight,
    distance: Math.round(gearKm(g.id) + (g.id === 'bdemo1' ? 18400e3 : g.id === 'bdemo3' ? 3200e3 : 0)), retired: !!g.retired, primary: !!g.primary,
  }));
  const newest = rides.map((x) => x.data.start_date_local!.slice(0, 10)).sort().pop() || through;
  // "Last sync" = the morning after the newest ride, so the demo clock shifts it together with the rides.
  const syncedAt = `${dayStr(utcDay(newest) + DAY)}T06:00:00.000Z`;
  const gear = GEAR.map((g, i): DemoGearFile => ({
    file: `gear/${g.id}.md`,
    data: { ...gearList[i], strava_url: null, synced_at: syncedAt, custom: { purchase_date: g.custom.purchase_date ?? dayStr(startMs + g.from * span - 5 * DAY), ...withoutPurchase(g.custom) } },
    body: g.body,
  }));

  const last = history[history.length - 1];
  if (last.ftp == null) throw new Error('The demo athlete history ends without an FTP');
  const lastFtp = last.ftp;
  const athlete = athleteFile({
    syncedAt,
    profile: { id: 'demo', first_name: 'Demo', last_name: 'Rider', username: 'demo-rider', city: cities[HOME_CITY].name, state: cities[HOME_CITY].region, country: cities[HOME_CITY].countryName, sex: null, weight: last.weight, ftp: last.ftp, premium: false, created_at: `${dayStr(startMs - 400 * DAY)}T12:00:00Z`, avatar: null },
    zones: { ftp: lastFtp, heart_rate_zones: HR_ZONES, heart_rate_zone_source: 'Manual', power_zones: cogganZones(lastFtp) },
    gear: gearList, stats: null,
    listComplete: true, oldest: rides.length ? rides[0].data.start_date : null,
  });
  const goals: Goal[] = [
    { id: 'year-km', label: 'Distance per year', period: 'year', metric: 'distance', target: 4500 },
    { id: 'year-elevation', label: 'Elevation per year', period: 'year', metric: 'elevation', target: 45000 },
    { id: 'month-hours', label: 'Hours per month', period: 'month', metric: 'time', target: 14 },
    { id: 'week-z2', label: 'Zone 2 per week', period: 'week', metric: 'zone_time', zone: 2, basis: 'power', target: 1.5 },
    { id: 'week-rides', label: 'Rides per week', period: 'week', metric: 'count', target: 2 },
    { id: 'month-long', label: 'Long rides (≥ 80 km) per month', period: 'month', metric: 'long_rides', min_km: 80, target: 1 },
  ];
  return {
    rides, gear, streams,
    data: {
      'athlete.json': athlete,
      'goals.json': goals,
      'fitness-history.json': history,
      'zones.json': {
        heart_rate: [
          { from: dayStr(startMs), bpm: EARLY_HR_BPM },
          { from: dayStr(startMs + Math.round(HR_ZONES_CHANGE * span / DAY) * DAY), bpm: lowerBounds(HR_ZONES) },
        ],
      },
      'meta.json': { note: 'Synthetic demo data on real roads. Regenerate with `npm run demo:generate`.', routes: ROUTE_ATTRIBUTION, seed, generated_through: through, newest_day: newest },
    },
  };
}

function withoutPurchase({ purchase_date, ...rest }: DemoGearCustom): Omit<DemoGearCustom, 'purchase_date'> { return rest; }
function shiftLocal(local: string, seconds: number): string { return new Date(Date.parse(`${local}Z`) + seconds * 1000).toISOString().slice(0, 19); }
/** Kilometre splits of an outdoor ride (one with altitude). */
function splitsOf(sim: Sim): RideSplit[] {
  const out: RideSplit[] = [];
  const altitude = sim.altitude!;
  let i0 = 0;
  for (let k = 1; i0 < sim.distance.length - 1; k++) {
    const i1 = firstIndex(sim.distance, k * 1000);
    if (i1 <= i0) break;
    const dist = sim.distance[i1] - sim.distance[i0], secs = i1 - i0;
    out.push({ split: k, distance: round(dist, 1), elapsed_time: secs, moving_time: secs, elevation_difference: round(altitude[i1] - altitude[i0], 1),
      average_speed: round(dist / secs, 2), average_heartrate: sim.heart ? round(mean(sim.heart, i0, i1 + 1), 1) : undefined });
    i0 = i1;
  }
  return out;
}

/** Dataset → { 'relative/path': text } below demo/. */
export function renderDemoFiles(demo: DemoData): Record<string, string> {
  const files: Record<string, string> = {};
  for (const x of demo.rides) files[x.file] = rideText(x.data, x.body);
  for (const x of demo.gear) files[x.file] = `---\n${toYaml(x.data)}---\n\n${x.body}\n`;
  for (const [id, s] of Object.entries(demo.streams)) if (s) files[`streams/${id}.json`] = JSON.stringify(s);
  for (const [name, value] of Object.entries(demo.data)) files[`data/${name}`] = JSON.stringify(value, null, 2) + '\n';
  return files;
}
