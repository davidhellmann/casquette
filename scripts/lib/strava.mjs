import fs from 'node:fs';
import path from 'node:path';
import { ROOT, log, sleep } from './env.mjs';

const TOKEN_FILE = path.join(ROOT, '.strava-token.json');
const API = 'https://www.strava.com/api/v3';
const OAUTH = 'https://www.strava.com/oauth/token';

/** Thrown when the daily limit is reached and waiting is not wanted. */
export class DailyLimitError extends Error {}

export const usage = { short: 0, daily: 0, shortLimit: 100, dailyLimit: 1000, calls: 0 };

export function readToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return null; }
}
function writeToken(t) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2), { mode: 0o600 });
}

/** Fetch (authorization_code) or refresh (refresh_token) the OAuth token. */
export async function exchange(params) {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env;
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) throw new Error('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing in .env');
  const body = new URLSearchParams({ client_id: STRAVA_CLIENT_ID, client_secret: STRAVA_CLIENT_SECRET, ...params });
  const r = await fetch(OAUTH, { method: 'POST', body });
  if (!r.ok) throw new Error(`Strava token error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const prev = readToken();
  const t = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
    athlete_id: (j.athlete && j.athlete.id) || (prev && prev.athlete_id) || null,
    scope: params.scope || (prev && prev.scope) || null,
  };
  writeToken(t);
  return t;
}

let token = null;
async function accessToken(force = false) {
  token = token || readToken();
  if (!token) throw new Error('No Strava token found – please run `npm run strava:auth` first.');
  if (force || token.expires_at * 1000 < Date.now() + 120_000) {
    token = await exchange({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
  }
  return token.access_token;
}

function parseRateHeaders(h) {
  // Strava reports an overall and a read limit – the read limit is the one that matters here.
  const lim = h.get('x-readratelimit-limit') || h.get('x-ratelimit-limit');
  const use = h.get('x-readratelimit-usage') || h.get('x-ratelimit-usage');
  if (lim) { const [a, b] = lim.split(',').map(Number); if (a) usage.shortLimit = a; if (b) usage.dailyLimit = b; }
  if (use) { const [a, b] = use.split(',').map(Number); usage.short = a || 0; usage.daily = b || 0; }
}

/** Milliseconds until the next 15-minute window (Strava counts in fixed quarter hours, UTC). */
export function msToNextWindow() {
  const d = new Date();
  const next = new Date(d);
  next.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15 + 15, 5, 0);
  return next - d;
}
/** Milliseconds until midnight UTC (daily limit reset). */
export function msToDailyReset() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 1, 0) - d.getTime();
}

async function waitDaily(wait) {
  if (!wait) throw new DailyLimitError('Strava daily limit reached');
  const ms = msToDailyReset();
  log(`⏸  Daily limit reached (${usage.daily}/${usage.dailyLimit}) – waiting until ${new Date(Date.now() + ms).toLocaleString('en-GB')} …`);
  await sleep(ms);
  usage.daily = 0; usage.short = 0;
}

/**
 * GET against the Strava API – with token refresh, rate-limit handling and retries.
 * Returns `null` on 404 (e.g. a manual activity without streams).
 */
export async function get(p, params = {}, { wait = false } = {}) {
  const url = new URL(API + p);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 8; attempt++) {
    if (usage.daily >= usage.dailyLimit - 1) await waitDaily(wait);
    if (usage.short >= usage.shortLimit - 1) {
      const ms = msToNextWindow();
      log(`⏸  15-minute limit reached – pausing ${Math.ceil(ms / 60000)} min …`);
      await sleep(ms);
      usage.short = 0;
    }
    let r;
    try {
      r = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    } catch (e) {
      log(`Network error (${e.message}) – retrying …`);
      await sleep(5000 * (attempt + 1));
      continue;
    }
    usage.calls++;
    parseRateHeaders(r.headers);
    if (r.status === 429) {
      if (usage.daily >= usage.dailyLimit - 1) { await waitDaily(wait); continue; }
      const ms = msToNextWindow();
      log(`⏸  Rate limit (429) – pausing ${Math.ceil(ms / 60000)} min …`);
      await sleep(ms);
      usage.short = 0;
      continue;
    }
    if (r.status === 401) { await accessToken(true); continue; }
    if (r.status === 404) return null;
    if (r.status >= 500) { await sleep(4000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`Strava ${r.status} on ${p}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  throw new Error(`Too many failed attempts: ${p}`);
}
