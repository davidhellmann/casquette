/**
 * Strava API adapter: one client per run with OAuth token refresh, rate-limit handling and retries.
 * Fetch, clock and token store are injected (real defaults for production) so the rate-limit rules
 * are testable without the network or real waiting. Also owns trimming Strava objects for the cache.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, log as defaultLog, systemClock } from '../../shared/env.mjs';
import { cogganZones, DEFAULT_HR_ZONES } from '../../../src/training/index.js';

const API = 'https://www.strava.com/api/v3';
const OAUTH = 'https://www.strava.com/oauth/token';
const ATTEMPTS = 8;
/** Returned by one attempt that should be retried (after its pause). */
const RETRY = Symbol('retry');

/** Thrown when the daily limit is reached and waiting is not wanted. */
export class DailyLimitError extends Error {}

/** Token store in `.strava-token.json` (owner-only permissions). */
export function fileTokenStore(file = path.join(ROOT, '.strava-token.json')) {
  return {
    read() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } },
    write(token) { fs.writeFileSync(file, JSON.stringify(token, null, 2), { mode: 0o600 }); },
  };
}

/** Fetch (authorization_code) or refresh (refresh_token) the OAuth token and store it. */
export async function exchangeToken(params, { fetch = globalThis.fetch, tokens = fileTokenStore(), env = process.env } = {}) {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = env;
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) throw new Error('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing in .env');
  const body = new URLSearchParams({ client_id: STRAVA_CLIENT_ID, client_secret: STRAVA_CLIENT_SECRET, ...params });
  const r = await fetch(OAUTH, { method: 'POST', body });
  if (!r.ok) throw new Error(`Strava token error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const prev = tokens.read();
  const t = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
    athlete_id: (j.athlete && j.athlete.id) || (prev && prev.athlete_id) || null,
    scope: params.scope || (prev && prev.scope) || null,
  };
  tokens.write(t);
  return t;
}

/** Milliseconds until the next 15-minute window (Strava counts in fixed quarter hours, UTC), plus 5 s. */
function msToNextWindow(now) {
  const next = new Date(now);
  next.setUTCMinutes(Math.floor(next.getUTCMinutes() / 15) * 15 + 15, 5, 0);
  return next.getTime() - now;
}
/** Milliseconds until 00:01 UTC (daily limit reset). */
function msToDailyReset(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 1, 0) - now;
}

/**
 * The Strava client for one run.
 * - `get(path, params?, { wait? })`: GET against the API; `null` on 404 (e.g. a manual activity
 *   without streams). Refreshes the token (also on 401), pauses for the 15-minute window, retries
 *   network errors and 5xx (of the token refresh, too), and at the daily limit throws a
 *   DailyLimitError, or with `wait` sleeps until the reset.
 * - `usage()`: requests made in this run and the window counters Strava reported.
 * - `isDailyLimit(error)`: whether an error from `get` means "daily limit reached, resume tomorrow".
 */
export function createStravaClient({ fetch = globalThis.fetch, clock = systemClock, tokens = fileTokenStore(), env = process.env, log = defaultLog } = {}) {
  const usage = { short: 0, daily: 0, shortLimit: 100, dailyLimit: 1000, calls: 0 };
  let token = null;

  /** Runs `attempt(n)` until it returns something other than RETRY – at most ATTEMPTS times. */
  async function retrying(label, attempt) {
    for (let n = 0; n < ATTEMPTS; n++) {
      const result = await attempt(n);
      if (result !== RETRY) return result;
    }
    throw new Error(`Too many failed attempts: ${label}`);
  }

  /** One fetch attempt: a network error pauses (growing with the attempt) and yields RETRY instead of throwing. */
  async function fetchOnce(url, init, n) {
    try {
      return await fetch(url, init);
    } catch (e) {
      log(`Network error (${e.message}) – retrying …`);
      await clock.sleep(5000 * (n + 1));
      return RETRY;
    }
  }

  /** After a 5xx: pause (growing with the attempt) and yield RETRY. */
  async function serverError(n) {
    await clock.sleep(4000 * (n + 1));
    return RETRY;
  }

  // The token refresh retries transient failures (network errors, 5xx) like every request;
  // a rejected refresh (4xx) reaches exchangeToken, which fails with Strava's message.
  const refreshFetch = (url, init) => retrying('token refresh', async (n) => {
    const r = await fetchOnce(url, init, n);
    if (r === RETRY) return RETRY;
    return r.status >= 500 ? serverError(n) : r;
  });

  async function accessToken(force = false) {
    token = token || tokens.read();
    if (!token) throw new Error('No Strava token found – please run `npm run strava:auth` first.');
    if (force || token.expires_at * 1000 < clock.now() + 120_000) {
      token = await exchangeToken({ grant_type: 'refresh_token', refresh_token: token.refresh_token }, { fetch: refreshFetch, tokens, env });
    }
    return token.access_token;
  }

  function readRateHeaders(h) {
    // Strava reports an overall and a read limit – the read limit is the one that matters here.
    const lim = h.get('x-readratelimit-limit') || h.get('x-ratelimit-limit');
    const use = h.get('x-readratelimit-usage') || h.get('x-ratelimit-usage');
    if (lim) { const [a, b] = lim.split(',').map(Number); if (a) usage.shortLimit = a; if (b) usage.dailyLimit = b; }
    if (use) { const [a, b] = use.split(',').map(Number); usage.short = a || 0; usage.daily = b || 0; }
  }

  async function waitShortWindow(reason) {
    const ms = msToNextWindow(clock.now());
    log(`⏸  ${reason} – pausing ${Math.ceil(ms / 60000)} min …`);
    await clock.sleep(ms);
    usage.short = 0;
  }

  async function waitDaily(wait) {
    if (!wait) throw new DailyLimitError('Strava daily limit reached');
    const ms = msToDailyReset(clock.now());
    log(`⏸  Daily limit reached (${usage.daily}/${usage.dailyLimit}) – waiting until ${new Date(clock.now() + ms).toLocaleString('en-GB')} …`);
    await clock.sleep(ms);
    usage.daily = 0; usage.short = 0;
  }

  async function get(p, params = {}, { wait = false } = {}) {
    const url = new URL(API + p);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
    return retrying(p, async (n) => {
      if (usage.daily >= usage.dailyLimit - 1) await waitDaily(wait);
      if (usage.short >= usage.shortLimit - 1) await waitShortWindow('15-minute limit reached');
      // Outside this request's retry: a missing token or rejected refresh is not a network hiccup.
      const auth = `Bearer ${await accessToken()}`;
      const r = await fetchOnce(url, { headers: { Authorization: auth } }, n);
      if (r === RETRY) return RETRY;
      usage.calls++;
      readRateHeaders(r.headers);
      if (r.status === 429) {
        if (usage.daily >= usage.dailyLimit - 1) await waitDaily(wait);
        else await waitShortWindow('Rate limit (429)');
        return RETRY;
      }
      if (r.status === 401) { await accessToken(true); return RETRY; }
      if (r.status === 404) return null;
      if (r.status >= 500) return serverError(n);
      if (!r.ok) throw new Error(`Strava ${r.status} on ${p}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    });
  }

  return {
    get,
    usage: () => ({ ...usage }),
    isDailyLimit: (error) => error instanceof DailyLimitError,
  };
}

/* ---------------- Strava athlete, zones and gear → our shapes ---------------- */
/** Strava zones ({min,max:-1}) → {min,max:null}; `null` without zones. */
export function normZones(z) {
  if (!Array.isArray(z) || !z.length) return null;
  return z.map((x) => ({ min: x.min ?? 0, max: x.max == null || x.max < 0 ? null : x.max }));
}

/** Today's zones from `/athlete/zones` (or null): Strava HR zones, else the default HR zones;
 * Strava power zones, else Coggan from the FTP. */
export function athleteZones(apiZones, ftp) {
  return {
    ftp,
    heart_rate_zones: normZones(apiZones?.heart_rate?.zones) || DEFAULT_HR_ZONES,
    heart_rate_zone_source: apiZones?.heart_rate ? (apiZones.heart_rate.custom_zones ? 'Manual' : 'Strava') : 'Default',
    power_zones: normZones(apiZones?.power?.zones) || (ftp ? cogganZones(ftp) : null),
  };
}

/** Strava athlete → profile of the athlete file (weight and FTP already resolved). */
export function athleteProfile(a, { weight, ftp }) {
  return {
    id: a.id, first_name: a.firstname, last_name: a.lastname, username: a.username,
    city: a.city, state: a.state, country: a.country, sex: a.sex,
    weight, ftp, premium: !!(a.summit || a.premium), created_at: a.created_at, avatar: a.profile || null,
  };
}

const gearType = (id) => (String(id).startsWith('b') ? 'bike' : 'shoe');
const FRAME = { 1: 'MTB', 2: 'Cross', 3: 'Road', 4: 'Time trial', 5: 'Gravel' };

/** Bikes and shoes listed on the Strava athlete (id and name only). */
export const athleteGear = (a) => [...(a.bikes || []), ...(a.shoes || [])].map((g) => ({ ...g, type: gearType(g.id) }));

/** Strava gear details (`/gear/<id>`) → cached gear. */
export function slimGear(g, id = g.id) {
  return {
    id: g.id, name: g.name || g.nickname || id, type: gearType(g.id),
    brand: g.brand_name || null, model: g.model_name || null, frame_type: FRAME[g.frame_type] || null,
    description: g.description || null, distance: g.distance || 0, retired: !!g.retired, primary: !!g.primary,
    weight: g.weight || null,
  };
}

/* ---------------- Slim down Strava objects for the activity cache ---------------- */
const pick = (o, keys) => { const r = {}; if (!o) return r; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const localISO = (s) => (s ? String(s).replace(/Z$/, '') : s);

const SUMMARY_KEYS = ['id', 'name', 'type', 'sport_type', 'workout_type', 'start_date', 'start_date_local', 'timezone', 'utc_offset',
  'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'elev_high', 'elev_low', 'average_speed', 'max_speed',
  'average_cadence', 'average_temp', 'average_watts', 'weighted_average_watts', 'max_watts', 'kilojoules', 'device_watts',
  'has_heartrate', 'average_heartrate', 'max_heartrate', 'heartrate_opt_out', 'suffer_score', 'trainer', 'commute', 'manual', 'private',
  'visibility', 'flagged', 'gear_id', 'start_latlng', 'end_latlng', 'location_city', 'location_state', 'location_country',
  'kudos_count', 'comment_count', 'athlete_count', 'photo_count', 'total_photo_count', 'achievement_count', 'pr_count',
  'external_id', 'upload_id_str', 'has_kudoed'];

/** Strava activity (list entry) → cached summary. */
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

/** Strava detailed activity → cached detail. */
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
