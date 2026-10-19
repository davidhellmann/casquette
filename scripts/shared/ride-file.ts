/**
 * Ride file: the Markdown file of one ride – where it lives, what its frontmatter holds, how its
 * text is rendered (ride body preserved) and the targeted metrics patch. Pure, no I/O: ride storage
 * writes it; generators and readers of ride files use the same rules.
 */
import type { RideFrontmatter } from '../../src/ride/index.ts';
import { toYaml } from './yaml.ts';
import { DEFAULT_RIDE_NAME } from '../../src/ride/defaults.ts';
import { currentMetrics, storedMetrics } from './metrics.ts';
import type { RideMetrics } from './metrics.ts';

import type { LatLng } from '../../src/scripts/polyline.ts';

export type { LatLng };

/** A cached Strava summary (activity cache `summary`): the summary fields the sync keeps. */
export type ActivitySummary = {
  id?: string;
  name?: string | null;
  type?: string;
  sport_type?: string;
  workout_type?: number | null;
  start_date?: string;
  /** Local start time as written, without a zone suffix. */
  start_date_local?: string;
  timezone?: string;
  utc_offset?: number;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  elev_high?: number | null;
  elev_low?: number | null;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number | null;
  average_temp?: number | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  kilojoules?: number | null;
  device_watts?: boolean;
  has_heartrate?: boolean;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  heartrate_opt_out?: boolean;
  suffer_score?: number | null;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  visibility?: string;
  flagged?: boolean;
  gear_id?: string | null;
  start_latlng?: LatLng | [] | null;
  end_latlng?: LatLng | [] | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  kudos_count?: number;
  comment_count?: number;
  athlete_count?: number;
  photo_count?: number;
  total_photo_count?: number;
  achievement_count?: number;
  pr_count?: number;
  external_id?: string | null;
  upload_id_str?: string | null;
  has_kudoed?: boolean;
  summary_polyline?: string | null;
};

/** One lap of a ride as cached. */
export type RideLap = {
  name?: string;
  lap_index?: number;
  split?: number;
  start_date_local?: string;
  elapsed_time?: number;
  moving_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  start_index?: number;
  end_index?: number;
  pace_zone?: number | null;
};

/** One kilometre split of a ride as cached. */
export type RideSplit = {
  split?: number;
  distance?: number;
  elapsed_time?: number;
  moving_time?: number;
  elevation_difference?: number | null;
  average_speed?: number;
  average_grade_adjusted_speed?: number | null;
  average_heartrate?: number | null;
  pace_zone?: number | null;
};

/** One segment effort of a ride as cached (segment fields flattened). */
export type RideSegmentEffort = {
  name?: string;
  segment_id: string | null;
  distance?: number;
  elapsed_time?: number;
  moving_time?: number;
  average_watts: number | null;
  device_watts: boolean | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  pr_rank: number | null;
  kom_rank: number | null;
  average_grade?: number | null;
  climb_category?: number | null;
  city?: string | null;
  /** Achievement types (`pr`, `overall` …). */
  achievements: string[];
  start_index?: number;
  end_index?: number;
};

/** One best effort of a ride as cached. */
export type RideBestEffort = { name?: string; distance?: number; elapsed_time?: number; moving_time?: number; pr_rank?: number | null };

/** Cached Strava details of a ride (activity cache `detail`). */
export type ActivityDetail = {
  description?: string | null;
  calories?: number | null;
  device_name?: string | null;
  perceived_exertion?: number | null;
  prefer_perceived_exertion?: boolean | null;
  hide_from_home?: boolean | null;
  gear?: { id?: string; name?: string | null; distance?: number; primary?: boolean };
  laps?: RideLap[];
  splits_metric?: RideSplit[];
  segment_efforts?: RideSegmentEffort[];
  best_efforts?: RideBestEffort[];
};

/** A place along a route. */
export type RidePlace = { name: string; region: string | null; country: string | null };

/** Places of a ride (the `geo:` block): start, countries, regions and every place along the route. */
export type RideGeo = {
  start: string;
  region: string | null;
  country: string | null;
  countries: string[];
  regions: string[];
  places: RidePlace[];
};

/** When the sync last fetched each part of a ride (epoch ms). */
export type SyncStamps = { summary?: number; detail?: number; streams?: number };

/** What a ride file is made from: an activity cache record (ride storage adds its own path). */
export type RideFileRecord = {
  id: string;
  summary?: ActivitySummary;
  detail?: ActivityDetail;
  metrics?: RideMetrics;
  geo?: RideGeo | null;
  /** Whether the ride's chart streams file exists. */
  streamsFile?: boolean;
  _sync?: SyncStamps;
};

/** Frontmatter and body of a Markdown file; `open + front + close + body` is the original text. */
export type FrontmatterParts = { open: string; front: string; close: string; body: string };

/** The frontmatter of a ride file. */
/**
 * The frontmatter as written. The ride module reads it back as `RideFrontmatter` (src/ride), which
 * differs only in requiring `start_date_local` – the content schema rejects a ride file without it.
 */
export type WrittenRideFrontmatter = ReturnType<typeof rideFrontmatter>;

/** Read side of a written frontmatter (tests, rebuild checks): the local start must be there. */
export function asReadFrontmatter(fm: WrittenRideFrontmatter): RideFrontmatter {
  if (typeof fm.start_date_local !== 'string') throw new Error(`Ride ${fm.id} has no local start date`);
  return { ...fm, start_date_local: fm.start_date_local };
}

/** Path below the rides folder: `<year>/<ride date>_<id>.md` (ride date = local start date). */
export function rideFileName(rec: Pick<RideFileRecord, 'id' | 'summary'>): string {
  const s: ActivitySummary = rec.summary || {};
  const day = (s.start_date_local || s.start_date || '0000-00-00').slice(0, 10);
  return `${day.slice(0, 4)}/${day}_${rec.id}.md`;
}

/**
 * Splits a Markdown file into frontmatter and body (LF or CRLF line endings); `null` without
 * frontmatter. `open + front + close + body` is the original text, byte for byte.
 */
export function splitFrontmatter(text: string | null | undefined): FrontmatterParts | null {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/.exec(text ?? '');
  return m ? { open: m[1], front: m[2], close: m[3], body: m[4] } : null;
}

/** The frontmatter of a ride file from an activity cache record. Stored metrics are zone-independent. */
export function rideFrontmatter(rec: RideFileRecord, { gearName = null }: { gearName?: string | null } = {}) {
  const s: ActivitySummary = rec.summary || {}, d: ActivityDetail = rec.detail || {};
  const metrics = storedMetrics(currentMetrics(s, rec.metrics));
  return {
    id: String(rec.id),
    name: s.name || DEFAULT_RIDE_NAME,
    sport_type: s.sport_type || s.type,
    type: s.type,
    workout_type: s.workout_type ?? null,
    start_date: s.start_date,
    start_date_local: s.start_date_local,
    timezone: s.timezone,
    utc_offset: s.utc_offset,
    strava_url: `https://www.strava.com/activities/${rec.id}`,
    // Flags
    trainer: !!s.trainer, commute: !!s.commute, manual: !!s.manual, private: !!s.private, visibility: s.visibility, flagged: !!s.flagged,
    // Gear and device
    gear_id: s.gear_id || null,
    gear_name: (d.gear && d.gear.name) || gearName || null,
    device_name: d.device_name || null,
    // Distance and time
    distance: s.distance, moving_time: s.moving_time, elapsed_time: s.elapsed_time,
    total_elevation_gain: s.total_elevation_gain, elev_high: s.elev_high ?? null, elev_low: s.elev_low ?? null,
    average_speed: s.average_speed, max_speed: s.max_speed,
    // Power
    device_watts: !!s.device_watts, average_watts: s.average_watts ?? null, weighted_average_watts: s.weighted_average_watts ?? null,
    max_watts: s.max_watts ?? null, kilojoules: s.kilojoules ?? null,
    // Heart rate and cadence
    has_heartrate: !!s.has_heartrate, average_heartrate: s.average_heartrate ?? null, max_heartrate: s.max_heartrate ?? null,
    average_cadence: s.average_cadence ?? null, average_temp: s.average_temp ?? null,
    // Load and energy
    suffer_score: s.suffer_score ?? null, calories: d.calories ?? null,
    perceived_exertion: d.perceived_exertion ?? null,
    // Social
    kudos_count: s.kudos_count ?? 0, comment_count: s.comment_count ?? 0, athlete_count: s.athlete_count ?? 1,
    photo_count: s.total_photo_count ?? s.photo_count ?? 0, achievement_count: s.achievement_count ?? 0, pr_count: s.pr_count ?? 0,
    // Location
    start_latlng: s.start_latlng && s.start_latlng.length ? s.start_latlng : null,
    end_latlng: s.end_latlng && s.end_latlng.length ? s.end_latlng : null,
    location_city: s.location_city || null, location_country: s.location_country || null,
    geo: rec.geo || null, // places along the route (scripts/sync/lib/geo.ts)
    summary_polyline: s.summary_polyline || null,
    // Computed
    metrics,
    // Details
    laps: d.laps || [],
    splits_metric: d.splits_metric || [],
    segment_efforts: d.segment_efforts || [],
    best_efforts: d.best_efforts || [],
    streams: rec.streamsFile ? `/streams/${rec.id}.json` : null,
    external_id: s.external_id || null,
    synced: {
      summary: rec._sync && rec._sync.summary ? new Date(rec._sync.summary).toISOString() : null,
      detail: rec._sync && rec._sync.detail ? new Date(rec._sync.detail).toISOString() : null,
      streams: rec._sync && rec._sync.streams ? new Date(rec._sync.streams).toISOString() : null,
    },
  };
}

/**
 * The ride body for a record. A new file (or one whose body is still empty) gets the Strava
 * description; existing user text – and a deliberately emptied, previously described body – is kept.
 * `existing`: current text of the ride file; `described`: whether the record already had a
 * description when the file was last written.
 */
export function rideBody(rec: RideFileRecord, { existing = null, described = false }: { existing?: string | null; described?: boolean } = {}): string {
  const current = splitFrontmatter(existing);
  const description = (rec.detail?.description || '').trim();
  if (current && (current.body.trim() || described)) return current.body;
  return description ? `\n${description}\n` : current?.body || '';
}

/** Full text of a ride file. */
export function rideText(frontmatter: object, body = ''): string {
  return `---\n${toYaml(frontmatter)}---\n${body}`;
}

/**
 * Targeted patch of the `metrics:` block, not a general YAML reserializer: removes the given
 * top-level metric keys, appends `add`, and keeps every other byte (geo, custom fields, body).
 */
export function patchRideMetrics(text: string | null, { remove = [], add = {} }: { remove?: readonly string[]; add?: object }): string {
  const parts = splitFrontmatter(text);
  if (!parts) throw new Error('unknown Markdown format');
  const removed = new Set(remove);
  let matched = false;
  const front = parts.front.replace(/^metrics:\r?\n((?:[ \t].*(?:\n|$)|\r?\n)*)/m, (block) => {
    matched = true;
    let removing = false;
    const clean = block.split('\n').filter((line) => {
      if (/^  \S/.test(line)) removing = removed.has(line.trim().split(':')[0]);
      return !removing || !line.trim();
    }).join('\n');
    const addition = toYaml(add).trimEnd().split('\n').map((line) => '  ' + line).join('\n');
    return clean.trimEnd() + '\n' + addition + (block.endsWith('\n') ? '\n' : '');
  });
  if (!matched) throw new Error('metrics missing from Markdown');
  return parts.open + front + parts.close + parts.body;
}
