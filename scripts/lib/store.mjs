import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { toYaml } from './yaml.mjs';
import { DEFAULT_RIDE_NAME } from '../../src/ride/defaults.js';
import { currentMetrics, storedMetrics } from './metrics.mjs';

/* ---------------- Slim down Strava objects ---------------- */
const pick = (o, keys) => { const r = {}; if (!o) return r; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const localISO = (s) => (s ? String(s).replace(/Z$/, '') : s);

const SUMMARY_KEYS = ['id', 'name', 'type', 'sport_type', 'workout_type', 'start_date', 'start_date_local', 'timezone', 'utc_offset',
  'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'elev_high', 'elev_low', 'average_speed', 'max_speed',
  'average_cadence', 'average_temp', 'average_watts', 'weighted_average_watts', 'max_watts', 'kilojoules', 'device_watts',
  'has_heartrate', 'average_heartrate', 'max_heartrate', 'heartrate_opt_out', 'suffer_score', 'trainer', 'commute', 'manual', 'private',
  'visibility', 'flagged', 'gear_id', 'start_latlng', 'end_latlng', 'location_city', 'location_state', 'location_country',
  'kudos_count', 'comment_count', 'athlete_count', 'photo_count', 'total_photo_count', 'achievement_count', 'pr_count',
  'external_id', 'upload_id_str', 'has_kudoed'];

export function slimSummary(a) {
  const s = pick(a, SUMMARY_KEYS);
  s.id = String(a.id);
  s.start_date_local = localISO(a.start_date_local);
  if (a.map) s.summary_polyline = a.map.summary_polyline || null;
  return s;
}

const LAP_KEYS = ['name', 'lap_index', 'split', 'start_date_local', 'elapsed_time', 'moving_time', 'distance', 'total_elevation_gain',
  'average_speed', 'max_speed', 'average_cadence', 'average_watts', 'device_watts', 'average_heartrate', 'max_heartrate', 'start_index', 'end_index', 'pace_zone'];
const SPLIT_KEYS = ['split', 'distance', 'elapsed_time', 'moving_time', 'elevation_difference', 'average_speed', 'average_grade_adjusted_speed', 'average_heartrate', 'pace_zone'];

export function slimDetail(d) {
  const out = pick(d, ['description', 'calories', 'device_name', 'perceived_exertion', 'prefer_perceived_exertion', 'hide_from_home', 'embed_token']);
  delete out.embed_token;
  if (d.gear) out.gear = pick(d.gear, ['id', 'name', 'distance', 'primary']);
  if (Array.isArray(d.laps)) out.laps = d.laps.map((l) => { const x = pick(l, LAP_KEYS); x.start_date_local = localISO(x.start_date_local); return x; });
  if (Array.isArray(d.splits_metric)) out.splits_metric = d.splits_metric.map((s) => pick(s, SPLIT_KEYS));
  if (Array.isArray(d.segment_efforts)) out.segment_efforts = d.segment_efforts.map((e) => ({
    name: e.name,
    segment_id: e.segment && e.segment.id != null ? String(e.segment.id) : null,
    distance: e.distance, elapsed_time: e.elapsed_time, moving_time: e.moving_time,
    average_watts: e.average_watts ?? null, device_watts: e.device_watts ?? null,
    average_heartrate: e.average_heartrate ?? null, max_heartrate: e.max_heartrate ?? null, average_cadence: e.average_cadence ?? null,
    pr_rank: e.pr_rank ?? null, kom_rank: e.kom_rank ?? null,
    average_grade: e.segment ? e.segment.average_grade : null, climb_category: e.segment ? e.segment.climb_category : null,
    city: e.segment ? e.segment.city : null,
    achievements: Array.isArray(e.achievements) ? e.achievements.map((x) => x.type) : [],
    start_index: e.start_index, end_index: e.end_index,
  }));
  if (Array.isArray(d.best_efforts) && d.best_efforts.length) out.best_efforts = d.best_efforts.map((b) => pick(b, ['name', 'distance', 'elapsed_time', 'moving_time', 'pr_rank']));
  return out;
}

/* ---------------- One Markdown file per ride ---------------- */
/** `_zones` is unused: stored metrics are zone-independent (time in zones is computed at build time). */
export function frontmatter(rec, _zones, extra = {}) {
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
    gear_name: (d.gear && d.gear.name) || extra.gear_name || null,
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

/* ---------------- Gear: one Markdown file per bike/shoe ----------------
 * The sync writes the Strava fields. The `custom:` block (purchase date, price, notes …)
 * and the Markdown body are yours – the sync keeps both unchanged. */
const DEFAULT_CUSTOM = 'custom:\n  purchase_date: null    # e.g. "2024-03-15"\n  price_eur: null        # purchase price → cost per km\n  components: []         # e.g. ["Shimano GRX 2x12", "Zipp 303 S"]\n  color: null\n  notes: null\n';

export function writeGear(g, { rebuild = false, root = ROOT } = {}) {
  const file = path.join(root, 'src', 'content', 'gear', `${g.id}.md`);
  let custom = DEFAULT_CUSTOM, body = '', syncedAt = null, hasBody = false;
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, 'utf8');
    const m = txt.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (m) {
      const stamp = m[1].match(/^synced_at: ("[^"\n]*"|null)$/m);
      if (stamp) syncedAt = JSON.parse(stamp[1]);
      const lines = m[1].split('\n');
      const i = lines.findIndex((l) => /^custom:/.test(l));
      if (i >= 0) {
        let j = i + 1;
        while (j < lines.length && (/^\s/.test(lines[j]) || lines[j] === '')) j++;
        custom = lines.slice(i, j).join('\n') + '\n';
      }
      body = m[2];
      hasBody = true;
    }
  }
  const fm = {
    id: g.id, name: g.name, type: g.type, brand: g.brand, model: g.model, frame_type: g.frame_type,
    description: g.description, weight: g.weight, distance: g.distance, retired: !!g.retired, primary: !!g.primary,
    strava_url: g.type === 'bike' ? `https://www.strava.com/bikes/${String(g.id).replace(/^b/, '')}` : `https://www.strava.com/shoes/${String(g.id).replace(/^g/, '')}`,
    synced_at: rebuild ? syncedAt : new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${toYaml(fm)}${custom}---\n${hasBody ? body : '\n<!-- Write freely about your bike here: setup, stories, photos … -->\n'}`);
}
