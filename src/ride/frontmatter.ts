/**
 * Ride frontmatter as the ride module reads it: the input of `processRide`. Types only.
 *
 * The sync writes the ride file (scripts/shared/ride-file.ts) with every Strava field of the activity;
 * only the fields `processRide` reads are declared here, all others pass through untyped. The content
 * collection schema (src/content-schemas.ts) checks just the required fields and lets everything else
 * through (`looseObject`, `metrics` only checked to be an object), so its inferred type is too loose to
 * derive this one from; src/content-schemas.ts checks at compile time that a parsed ride entry is
 * assignable to `RideFrontmatter`.
 * Unknown values are null or missing.
 */
import type { PowerCurve, ZoneSet } from '../training/index.ts';
import type { Distribution } from './distribution.ts';

/** A lap of a ride (Strava lap; values in metres, seconds, m/s, W, bpm, rpm). */
export interface Lap {
  name?: string | null;
  lap_index?: number | null;
  split?: number | null;
  start_date_local?: string | null;
  elapsed_time?: number | null;
  moving_time?: number | null;
  distance?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  max_speed?: number | null;
  average_cadence?: number | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  /** First and last index into the ride's streams. */
  start_index?: number | null;
  end_index?: number | null;
}

/** A metric split (one kilometre) of a ride. */
export interface Split {
  /** Number of the kilometre, from 1. */
  split?: number | null;
  distance?: number | null;
  elapsed_time?: number | null;
  moving_time?: number | null;
  /** Metres gained (+) or lost (−) over the split. */
  elevation_difference?: number | null;
  average_speed?: number | null;
  average_heartrate?: number | null;
}

/** One effort on a Strava segment during a ride. */
export interface SegmentEffort {
  name?: string | null;
  segment_id?: string | number | null;
  distance?: number | null;
  elapsed_time?: number | null;
  moving_time?: number | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  /** Strava's PR rank of the effort (1 = PR), null without one. */
  pr_rank?: number | null;
  kom_rank?: number | null;
  /** Average grade in %. */
  average_grade?: number | null;
  /** Strava climb category 0–5 (0 = none, 5 = HC). */
  climb_category?: number | null;
  city?: string | null;
  /** Achievement types, e.g. 'pr'. */
  achievements?: string[] | null;
  /** First and last index into the ride's streams. */
  start_index?: number | null;
  end_index?: number | null;
}

/** A place a ride passed through (reverse geocoding at sync). */
export interface Place {
  name: string;
  region?: string | null;
  /** ISO country code. */
  country?: string | null;
}

/** Places of an outdoor ride (written by the sync's geocoding); indoor rides have none. */
export interface RideGeo {
  /** Name of the start place. */
  start?: string | null;
  region?: string | null;
  country?: string | null;
  countries?: string[];
  regions?: string[];
  places: Place[];
}

/**
 * Basis of power TIZ stored at sync (legacy TIZ): power TIZ with unknown zone boundaries and, if known,
 * the FTP of the sync day. Rewritten from the former `ftp_used` (scripts/shared/metrics.ts).
 */
export interface StoredPowerTizBasis {
  source?: string | null;
  ftp?: number | null;
  zones?: ZoneSet | null;
  exact?: boolean | null;
}

/** Basis of HR TIZ stored at sync: the HR zones of the sync day, if known. */
export interface StoredHrTizBasis {
  /** 'sync' in files written by older syncs. */
  source?: string | null;
  zones?: ZoneSet | null;
}

/** Metrics the sync computed from streams or the activity summary (`metrics:` in the ride file). */
export interface RideMetrics {
  /** Normalized power, from streams or the summary (see `metric_sources.np`). */
  np?: number | null;
  variability_index?: number | null;
  efficiency_factor?: number | null;
  /** Decoupling in %. */
  decoupling_pct?: number | null;
  power_curve?: PowerCurve | null;
  /** Best average heart rate per duration in seconds. */
  hr_curve?: Record<string, number | null> | null;
  power_distribution?: Distribution | null;
  hr_distribution?: Distribution | null;
  /** Legacy power TIZ: seconds per power zone, stored at sync. */
  time_in_power_zones?: readonly number[] | null;
  time_in_power_zones_basis?: StoredPowerTizBasis | null;
  /** FTP of the sync day in old, unmigrated files (now in `time_in_power_zones_basis.ftp`). */
  ftp_used?: number | null;
  /** HR TIZ stored at sync: seconds per HR zone. */
  time_in_hr_zones?: readonly number[] | null;
  time_in_hr_zones_basis?: StoredHrTizBasis | null;
  /** Whether a time stream was present ('streams') or only the summary ('summary'). */
  source?: string | null;
  /** Provenance per metric, e.g. `{ np: 'streams' }`. */
  metric_sources?: Record<string, string> | null;
}

/** Ride frontmatter: the fields of a ride file the ride module reads (GLOSSARY "Ride file"). */
export interface RideFrontmatter {
  /** Strava activity id (a number in old files). */
  id: string | number;
  name?: string | null;
  sport_type?: string | null;
  /** Legacy Strava activity type, only read for indoor detection. */
  type?: string | null;
  /** Actual start instant (ISO with Z); missing in legacy/synthetic files. */
  start_date?: string | null;
  /** Written local start time ('YYYY-MM-DDTHH:mm:ss', its calendar components are the ride date). */
  start_date_local: string;
  trainer?: boolean | null;
  commute?: boolean | null;
  gear_id?: string | null;
  gear_name?: string | null;
  device_name?: string | null;
  /** Metres. */
  distance?: number | null;
  /** Seconds. */
  moving_time?: number | null;
  elapsed_time?: number | null;
  /** Metres. */
  total_elevation_gain?: number | null;
  elev_low?: number | string | null;
  elev_high?: number | string | null;
  /** m/s. */
  average_speed?: number | null;
  max_speed?: number | null;
  /** Whether the watts come from a power meter (only then are they average power and NP). */
  device_watts?: boolean | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  kilojoules?: number | null;
  /** `false` = ignore every heart-rate value. */
  has_heartrate?: boolean | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  /** °C. */
  average_temp?: number | null;
  /** Relative Effort. */
  suffer_score?: number | null;
  calories?: number | null;
  /** RPE 1–10. */
  perceived_exertion?: number | null;
  pr_count?: number | null;
  achievement_count?: number | null;
  kudos_count?: number | null;
  /** Google encoded polyline of the route. */
  summary_polyline?: string | null;
  /** Public path of the chart streams file, if any. */
  streams?: string | null;
  segment_efforts?: SegmentEffort[] | null;
  laps?: Lap[] | null;
  splits_metric?: Split[] | null;
  geo?: RideGeo | null;
  metrics?: RideMetrics | null;
}
