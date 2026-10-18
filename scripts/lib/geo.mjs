/**
 * Places and countries per ride via reverse geocoding (OpenStreetMap Nominatim, no key).
 *
 * - The route is sampled every ~1 km and rounded to a grid (~1.5 km).
 *   Only the centres of these grid cells go to Nominatim – no times, no ride data.
 * - Each cell is queried exactly once and stored in src/data/geo-cells.json (stays local/gitignored – it reveals every place ridden).
 * - Nominatim allows at most 1 request/second → the first run takes a while (~1 h for ~3,000 cells),
 *   afterwards only a few new cells are added per week.
 *   Policy: https://operations.osmfoundation.org/policies/nominatim/
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, writeJSON, sleep, log } from './env.mjs';
import { decodePolyline } from '../../src/scripts/polyline.js';

/** The place cache below `root`; a cache at its former location is moved there on first use. */
function geoCellsFile(root) {
  const file = path.join(root, 'src', 'data', 'geo-cells.json');
  const legacy = path.join(root, '.strava-cache', 'geo-cells.json');
  if (!fs.existsSync(file) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.renameSync(legacy, file);
  }
  return file;
}
const GRID = 0.015;   // degrees (~1.6 km N-S, ~1.1 km E-W in Central Europe)
const STEP_KM = 1;    // sampling distance along the route
const GAP_MS = 1100;  // > 1 s between requests

/** Nominatim settings, read from the environment at call time (after .env is loaded). */
export const nominatimConfig = (env = process.env) => ({
  endpoint: env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse',
  // The usage policy requires a User-Agent that identifies the application.
  userAgent: env.NOMINATIM_UA || 'casquette/0.1 (self-hosted training dashboard)',
  lang: env.GEO_LANG || 'en',
});

const toR = Math.PI / 180;
function km(a, b) {
  const dl = (b[0] - a[0]) * toR, dn = (b[1] - a[1]) * toR;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
const cellKey = (p) => `${Math.round(p[0] / GRID)}:${Math.round(p[1] / GRID)}`;
const cellCenter = (k) => k.split(':').map((n) => +(Number(n) * GRID).toFixed(5));

/** Outdoor ride with GPS? (Zwift and similar use fictional coordinates.) */
export const isGeoRide = (s) => !!(s && s.summary_polyline && !s.trainer && !/^Virtual/.test(s.sport_type || s.type || ''));

/** Ordered, unique grid cells along the route (start + every ~1 km + finish). */
export function routeCells(polyline) {
  const ll = decodePolyline(polyline).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!ll.length) return [];
  const out = [], seen = new Set();
  const add = (p) => { const k = cellKey(p); if (!seen.has(k)) { seen.add(k); out.push(k); } };
  add(ll[0]);
  let acc = 0;
  for (let i = 1; i < ll.length; i++) {
    acc += km(ll[i - 1], ll[i]);
    if (acc >= STEP_KM) { acc = 0; add(ll[i]); }
  }
  add(ll[ll.length - 1]);
  return out;
}

/** Nominatim response → compact place. */
function slimPlace(j) {
  const a = (j && j.address) || {};
  const name = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || a.state || null;
  if (!name && !a.country_code) return { none: 1 };
  return { n: name, r: a.state || a.region || a.county || null, c: (a.country_code || '').toUpperCase() || null };
}

async function reverse([lat, lon]) {
  const { endpoint, userAgent, lang } = nominatimConfig();
  const url = `${endpoint}?format=jsonv2&zoom=13&addressdetails=1&accept-language=${lang}&lat=${lat}&lon=${lon}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) { await sleep(30000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const j = await res.json();
    if (j && j.error) return { none: 1 }; // e.g. "Unable to geocode" (water)
    return slimPlace(j);
  }
  throw new Error('Nominatim not responding (rate limit)');
}

/** Derive a ride's places from its (fully) resolved cells. null = not complete yet. */
export function rideGeo(polyline, cells) {
  const keys = routeCells(polyline);
  if (!keys.length) return null;
  const hits = [];
  for (const k of keys) {
    if (!(k in cells)) return null;
    const c = cells[k];
    if (c && !c.none && c.n) hits.push(c);
  }
  if (!hits.length) return null;
  const places = [], countries = [], regions = [], seen = new Set();
  for (const h of hits) {
    const id = `${h.c}|${h.n}`;
    if (!seen.has(id)) { seen.add(id); places.push({ name: h.n, region: h.r || null, country: h.c || null }); }
    if (h.c && !countries.includes(h.c)) countries.push(h.c);
    if (h.r && !regions.includes(h.r)) regions.push(h.r);
  }
  return { start: hits[0].n, region: hits[0].r || null, country: hits[0].c || null, countries, regions, places };
}

/**
 * Resolve missing cells and set `rec.geo`.
 * @param recs       cache records (newest first works best)
 * @param root       checkout whose place cache (src/data/geo-cells.json) is used
 * @param budgetMs   time limit (0 = unlimited) – the rest follows on the next run
 * @param onRide     callback(rec) for every ride whose geo changed (→ rewrite Markdown)
 */
export async function geocodeRides(recs, { root = ROOT, budgetMs = 0, onRide } = {}) {
  const GEO_FILE = geoCellsFile(root);
  const cells = readJSON(GEO_FILE, {}) || {};
  const rides = recs.filter((r) => isGeoRide(r.summary));
  const todo = [];
  const seen = new Set();
  for (const r of rides) for (const k of routeCells(r.summary.summary_polyline)) if (!(k in cells) && !seen.has(k)) { seen.add(k); todo.push(k); }

  const t0 = Date.now();
  let asked = 0, failed = 0, stopped = false;
  if (todo.length) log(`🌍 Places: ${todo.length} new map cells (≈ ${Math.ceil((todo.length * GAP_MS) / 60000)} min at 1 request/s)`);
  for (const k of todo) {
    if (budgetMs && Date.now() - t0 > budgetMs) { stopped = true; break; }
    const t = Date.now();
    try { cells[k] = await reverse(cellCenter(k)); asked++; }
    catch (e) { failed++; if (failed >= 5) { log(`⚠️  Geocoding aborted: ${e.message}`); stopped = true; break; } }
    if (asked % 25 === 0) writeJSON(GEO_FILE, cells, false);
    if (asked % 250 === 0 && asked) log(`  … ${asked}/${todo.length} cells`);
    const wait = GAP_MS - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  }
  writeJSON(GEO_FILE, cells, false);

  let changed = 0, complete = 0;
  for (const r of rides) {
    const g = rideGeo(r.summary.summary_polyline, cells);
    if (!g) continue; // incomplete → keep the existing assignment
    complete++;
    if (JSON.stringify(g) !== JSON.stringify(r.geo || null)) {
      r.geo = g;
      changed++;
      if (onRide) onRide(r);
    }
  }
  const left = todo.length - asked;
  log(`🌍 Places: ${asked} cells queried · ${complete}/${rides.length} outdoor rides assigned · ${changed} updated` +
    (left > 0 && stopped ? ` · ${left} cells still pending (next run or \`npm run geo\`)` : ''));
  return { asked, changed, left };
}
