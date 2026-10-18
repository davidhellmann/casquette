/**
 * Ride file: the Markdown file of one ride – where it lives, what its frontmatter holds, how its
 * text is rendered (ride body preserved) and the targeted metrics patch. Pure, no I/O: ride storage
 * writes it; generators and readers of ride files use the same rules.
 */
import { toYaml } from './yaml.mjs';
import { DEFAULT_RIDE_NAME } from '../../src/ride/defaults.js';
import { currentMetrics, storedMetrics } from './metrics.mjs';

/** Path below the rides folder: `<year>/<ride date>_<id>.md` (ride date = local start date). */
export function rideFileName(rec) {
  const s = rec.summary || {};
  const day = (s.start_date_local || s.start_date || '0000-00-00').slice(0, 10);
  return `${day.slice(0, 4)}/${day}_${rec.id}.md`;
}

/**
 * Splits a Markdown file into frontmatter and body (LF or CRLF line endings); `null` without
 * frontmatter. `open + front + close + body` is the original text, byte for byte.
 */
export function splitFrontmatter(text) {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/.exec(text ?? '');
  return m ? { open: m[1], front: m[2], close: m[3], body: m[4] } : null;
}

/** The frontmatter of a ride file from an activity cache record. Stored metrics are zone-independent. */
export function rideFrontmatter(rec, { gearName = null } = {}) {
  const s = rec.summary || {}, d = rec.detail || {};
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
    geo: rec.geo || null, // places along the route (scripts/lib/geo.mjs)
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
 * @param {string|null} existing current text of the ride file
 * @param {boolean} described whether the record already had a description when the file was last written
 */
export function rideBody(rec, { existing = null, described = false } = {}) {
  const current = splitFrontmatter(existing);
  const description = (rec.detail?.description || '').trim();
  if (current && (current.body.trim() || described)) return current.body;
  return description ? `\n${description}\n` : current?.body || '';
}

/** Full text of a ride file. */
export function rideText(frontmatter, body = '') {
  return `---\n${toYaml(frontmatter)}---\n${body}`;
}

/**
 * Targeted patch of the `metrics:` block, not a general YAML reserializer: removes the given
 * top-level metric keys, appends `add`, and keeps every other byte (geo, custom fields, body).
 */
export function patchRideMetrics(text, { remove = [], add = {} }) {
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
