/**
 * Ride module: frontmatter + athlete state on the ride date → final ride.
 * Pure, without Astro, file system or clock. Build I/O lives in lib/data.ts (build dataset: lib/build-dataset.ts).
 * Rules and contracts: docs/ride.md.
 */
import { DEFAULT_RIDE_NAME } from './defaults.ts';
import { calendarDate, countsInStats, isIndoor, rideLoad, zoneIdx } from '../training/index.ts';
import type { AthleteState, AthleteZones, PowerCurve, ZoneSet } from '../training/index.ts';
import { distributionTiz } from './distribution.ts';
import type { Lap, RideFrontmatter, RideGeo, RideMetrics, SegmentEffort, Split } from './frontmatter.ts';

export { tizTotal } from './tiz-total.ts';
export type { TizRide, TizSource, TizTotal } from './tiz-total.ts';
export type { Distribution, HrDistribution, PowerDistribution } from './distribution.ts';
export type {
  Lap, Place, RideFrontmatter, RideGeo, RideMetrics, SegmentEffort, Split, StoredHrTizBasis, StoredPowerTizBasis,
} from './frontmatter.ts';

/** What decided a ride classification. */
export type ClassificationSource = 'power' | 'hr' | 'effort' | 'none';

/**
 * Ride classification (GLOSSARY): the zone (1-based) a ride falls into by average power, average HR or the
 * effort estimate, with what decided it; `{ zone: null, source: 'none' }` when nothing could.
 */
export type RideClassification =
  | { zone: number; source: Exclude<ClassificationSource, 'none'> }
  | { zone: null; source: 'none' };

/** Basis of a ride's power TIZ: where it comes from and which zone boundaries it used. */
export type PowerTizBasis =
  /** Computed from the power distribution with the zones on the ride date. */
  | { source: 'distribution'; ftp: number; zones: ZoneSet; exact: true }
  /** Legacy TIZ stored at sync (`legacy`, boundaries unknown, FTP of the sync day if known) or no TIZ (`none`). */
  | { source: 'legacy' | 'none'; ftp: number | null; zones: ZoneSet | null; exact: false };

/** Basis of a ride's HR TIZ: where it comes from and which zone boundaries it used. */
export type HrTizBasis =
  /** Computed from the HR distribution with the HR zones on the ride date. */
  | { source: 'distribution'; zones: ZoneSet; exact: true }
  /** Stored at sync with the HR zones of the sync day. */
  | { source: 'sync'; zones: ZoneSet; exact: false }
  /** Stored at sync without known zones, or no HR TIZ. */
  | { source: 'legacy'; zones: null; exact: false };

/** TIZ basis per basis. */
export interface TizBasis {
  power: PowerTizBasis;
  hr: HrTizBasis;
}

/**
 * The final ride (output of `processRide`): flat fields for every page, the dashboard and the ride lists.
 * Units: metres, seconds, m/s, watts, bpm. Unknown values are null; 0 is a value. Rules: docs/ride.md.
 */
export interface Ride {
  id: string;
  name: string;
  sport_type: string;
  /** Written local start time (the ride date is its calendar day). */
  start_local: string;
  /** Actual start (Unix ms), null for legacy rides without `start_date`. */
  start: number | null;
  /** Local start as a Date (wall-clock components of `start_local`). */
  d: Date;
  year: number;
  /** Month 0–11. */
  month: number;
  indoor: boolean;
  /** Stat ride (counts in totals, goals, load …); false for e-bike rides. */
  stats: boolean;
  gear_id: string | null;
  gear_name: string | null;
  /** Recording device. */
  device: string | null;
  commute: boolean;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  /** Elevation gain. */
  elev: number;
  elev_low: number | null;
  elev_high: number | null;
  /** Perceived exertion. */
  rpe: number | null;
  /** Average speed. */
  speed: number;
  max_speed: number;
  /** Average power from a power meter. */
  w: number | null;
  /** Normalized power. */
  np: number | null;
  max_watts: number | null;
  kj: number | null;
  /** Average heart rate. */
  hr: number | null;
  hr_max: number | null;
  /** Average cadence. */
  cad: number | null;
  /** Average temperature (°C). */
  temp: number | null;
  /** Relative Effort. */
  re: number | null;
  kcal: number | null;
  /** PR count. */
  pr: number;
  /** Achievement count. */
  ach: number;
  kudos: number;
  tss: number | null;
  /** Intensity Factor. */
  if_: number | null;
  /** FTP on the ride date. */
  ftp: number;
  /** Body weight on the ride date. */
  kg: number;
  /** Efficiency Factor. */
  ef: number | null;
  load: number;
  /** Zones on the ride date. */
  zones: AthleteZones;
  /** Ride classification, power preferred. */
  clsP: RideClassification;
  /** Ride classification, heart rate preferred. */
  clsH: RideClassification;
  /** Average power in W/kg with the weight on the ride date. */
  avg_wkg: number | null;
  np_wkg: number | null;
  /** Variability Index. */
  vi: number | null;
  /** Decoupling in %. */
  dec: number | null;
  /** Power curve. */
  best: PowerCurve | null;
  /** Power TIZ: seconds per power zone. */
  tizP: readonly number[] | null;
  /** HR TIZ: seconds per HR zone. */
  tizH: readonly number[] | null;
  tizBasis: TizBasis;
  /** Encoded route polyline. */
  polyline: string | null;
  /** Whether chart streams exist. */
  streams: boolean;
  /** Moving time in hours. */
  h: number;
  segs: SegmentEffort[];
  laps: Lap[];
  splits: Split[];
  geo: RideGeo | null;
}

const num = (v: number | string | null | undefined): number | null => (v == null || v === '' ? null : Number(v));
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

function classifications(w: number | null, hr: number | null, re: number | null, h: number, zones: AthleteZones) {
  const power: RideClassification | null = w == null ? null : { zone: zoneIdx(w, zones.power_zones) + 1, source: 'power' };
  const heart: RideClassification | null = hr == null ? null : { zone: zoneIdx(hr, zones.heart_rate_zones) + 1, source: 'hr' };
  let estimate: RideClassification | null = null;
  // Existing dashboard heuristic: effort 0 or duration 0 yields no effort estimate.
  if (re != null && re > 0 && h > 0) {
    const eph = re / h;
    const zone = eph < 35 ? 1 : eph < 70 ? 2 : eph < 110 ? 3 : 4;
    estimate = { zone, source: 'effort' };
  }
  const unknown: RideClassification = { zone: null, source: 'none' };
  return { clsP: power || heart || estimate || unknown, clsH: heart || power || estimate || unknown };
}

/** Legacy histograms remain untouched: sync FTP alone never proves zone boundaries.
 * HR time in zones stored at sync keeps the zones of the sync day (or unknown ones). */
function timeInZones(m: RideMetrics, athleteState: AthleteState): Pick<Ride, 'tizP' | 'tizH' | 'tizBasis'> {
  const rebuilt = distributionTiz(m.power_distribution, athleteState.zones.power_zones);
  const legacy = m.time_in_power_zones_basis;
  const ftp = legacy?.ftp ?? m.ftp_used ?? null;
  const hrRebuilt = distributionTiz(m.hr_distribution, athleteState.zones.heart_rate_zones);
  const hrZones = m.time_in_hr_zones_basis?.zones ?? null;
  return {
    tizP: rebuilt ?? m.time_in_power_zones ?? null,
    tizH: hrRebuilt ?? m.time_in_hr_zones ?? null,
    tizBasis: {
      power: rebuilt
        ? { source: 'distribution', ftp: athleteState.ftp, zones: athleteState.zones.power_zones, exact: true }
        : { source: m.time_in_power_zones ? 'legacy' : 'none', ftp, zones: legacy?.zones ?? null, exact: false },
      hr: hrRebuilt
        ? { source: 'distribution', zones: athleteState.zones.heart_rate_zones, exact: true }
        : hrZones ? { source: 'sync', zones: hrZones, exact: false } : { source: 'legacy', zones: null, exact: false },
    },
  };
}

/** `athleteState` is athleteTimeline(...).at(a.start_date_local); no defaults of its own. */
export function processRide(a: RideFrontmatter, athleteState: AthleteState): Ride {
  const m: RideMetrics = a.metrics || {};
  const d = calendarDate(a.start_date_local);
  const instant = a.start_date == null ? NaN : +new Date(a.start_date);
  const start = Number.isFinite(instant) ? instant : null;
  const w = a.device_watts ? a.average_watts ?? null : null;
  const np = m.np ?? (a.device_watts ? a.weighted_average_watts ?? null : null);
  const hr = a.has_heartrate !== false ? a.average_heartrate ?? null : null;
  const { ftp, weight: kg, zones } = athleteState;
  const h = (a.moving_time || 0) / 3600;
  const if_ = np != null ? np / ftp : null;
  const tss = if_ != null ? Math.round(h * if_ * if_ * 100) : null;
  const ef = np != null && hr != null && hr > 0 ? Math.round(np / hr * 1000) / 1000 : null;
  const re = a.suffer_score ?? null;
  return {
    id: String(a.id), name: a.name || DEFAULT_RIDE_NAME, sport_type: a.sport_type || 'Ride', start_local: a.start_date_local, start, d,
    year: d.getFullYear(), month: d.getMonth(), indoor: isIndoor(a), stats: countsInStats(a.sport_type || 'Ride'),
    gear_id: a.gear_id || null, gear_name: a.gear_name || null, device: a.device_name || null, commute: !!a.commute,
    distance: a.distance || 0, moving_time: a.moving_time || 0, elapsed_time: a.elapsed_time || 0, elev: a.total_elevation_gain || 0,
    elev_low: num(a.elev_low), elev_high: num(a.elev_high), rpe: a.perceived_exertion ?? null,
    speed: a.average_speed || 0, max_speed: a.max_speed || 0, w, np, max_watts: a.max_watts ?? null, kj: a.kilojoules ?? null,
    hr, hr_max: a.max_heartrate ?? null, cad: a.average_cadence ?? null, temp: a.average_temp ?? null,
    re, kcal: a.calories ?? (a.kilojoules ? Math.round(a.kilojoules) : null),
    pr: a.pr_count || 0, ach: a.achievement_count || 0, kudos: a.kudos_count || 0,
    tss, if_, ftp, kg, ef, load: rideLoad({ tss, re }), zones, ...classifications(w, hr, re, h, zones),
    avg_wkg: w != null ? Math.round(w / kg * 100) / 100 : null,
    np_wkg: np != null ? Math.round(np / kg * 100) / 100 : null,
    vi: m.variability_index ?? null,
    dec: m.decoupling_pct ?? null, best: m.power_curve || null,
    ...timeInZones(m, athleteState),
    polyline: a.summary_polyline || null, streams: !!a.streams, h,
    segs: list(a.segment_efforts), laps: list(a.laps), splits: list(a.splits_metric),
    geo: a.geo && Array.isArray(a.geo.places) ? a.geo : null,
  };
}
