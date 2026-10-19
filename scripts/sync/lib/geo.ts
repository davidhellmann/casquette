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
import { ROOT, errorMessage, readJSON, writeJSON, sleep, log } from '../../shared/env.ts';
import { decodePolyline } from '../../../src/scripts/polyline.ts';
import { isIndoor } from '../../../src/training/index.ts';
import type { ActivitySummary, RideGeo } from '../../shared/ride-file.ts';

/** A resolved grid cell: place name, region and country code. */
export type GeoPlace = { n: string | null; r: string | null; c: string | null };
/** A grid cell: a place, or `none` where Nominatim knows nothing (e.g. water). */
export type GeoCell = GeoPlace | { none: 1 };
/** The place cache: grid cell key (`<lat>:<lon>` in grid steps) → cell. */
export type GeoCells = Record<string, GeoCell>;

/** What geocoding reads and sets on a ride (a ride record). */
export type GeoRide = { summary?: ActivitySummary; geo?: RideGeo | null };

/** Nominatim's reverse geocoding answer (the fields read). */
type NominatimResponse = {
  error?: string;
  address?: {
    city?: string; town?: string; village?: string; municipality?: string; hamlet?: string; suburb?: string;
    county?: string; state?: string; region?: string; country_code?: string;
  };
};

/** The place cache below `root`; a cache at its former location is moved there on first use. */
function geoCellsFile(root: string): string {
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
export const nominatimConfig = (env: Readonly<Record<string, string | undefined>> = process.env) => ({
  endpoint: env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse',
  // The usage policy requires a User-Agent that identifies the application.
  userAgent: env.NOMINATIM_UA || 'casquette/1.0 (self-hosted training dashboard)',
  lang: env.GEO_LANG || 'en',
});

const toR = Math.PI / 180;
type Point = readonly number[];
function km(a: Point, b: Point): number {
  const dl = (b[0] - a[0]) * toR, dn = (b[1] - a[1]) * toR;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
const cellKey = (p: Point) => `${Math.round(p[0] / GRID)}:${Math.round(p[1] / GRID)}`;
const cellCenter = (k: string): number[] => k.split(':').map((n) => +(Number(n) * GRID).toFixed(5));

/** Outdoor ride with GPS? (Indoor rides – Zwift and similar – use fictional coordinates.) */
export const isGeoRide = (s: ActivitySummary | null | undefined): boolean => !!(s && s.summary_polyline && !isIndoor(s));

/** Ordered, unique grid cells along the route (start + every ~1 km + finish). */
export function routeCells(polyline: string | null | undefined): string[] {
  const ll: Point[] = decodePolyline(polyline).filter((p: Point) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!ll.length) return [];
  const out: string[] = [], seen = new Set<string>();
  const add = (p: Point) => { const k = cellKey(p); if (!seen.has(k)) { seen.add(k); out.push(k); } };
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
function slimPlace(j: NominatimResponse | null): GeoCell {
  const a = (j && j.address) || {};
  const name = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || a.state || null;
  if (!name && !a.country_code) return { none: 1 };
  return { n: name, r: a.state || a.region || a.county || null, c: (a.country_code || '').toUpperCase() || null };
}

async function reverse([lat, lon]: Point): Promise<GeoCell> {
  const { endpoint, userAgent, lang } = nominatimConfig();
  const url = `${endpoint}?format=jsonv2&zoom=13&addressdetails=1&accept-language=${lang}&lat=${lat}&lon=${lon}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) { await sleep(30000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const j = (await res.json()) as NominatimResponse | null;
    if (j && j.error) return { none: 1 }; // e.g. "Unable to geocode" (water)
    return slimPlace(j);
  }
  throw new Error('Nominatim not responding (rate limit)');
}

/** Derive a ride's places from its (fully) resolved cells. null = not complete yet. */
export function rideGeo(polyline: string | null | undefined, cells: GeoCells): RideGeo | null {
  const keys = routeCells(polyline);
  if (!keys.length) return null;
  const hits: (GeoPlace & { n: string })[] = [];
  for (const k of keys) {
    if (!(k in cells)) return null;
    const c = cells[k];
    if (c && !('none' in c && c.none) && 'n' in c && c.n) hits.push({ ...c, n: c.n });
  }
  if (!hits.length) return null;
  const places: RideGeo['places'] = [], countries: string[] = [], regions: string[] = [], seen = new Set<string>();
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
export async function geocodeRides<R extends GeoRide>(
  recs: R[], { root = ROOT, budgetMs = 0, onRide }: { root?: string; budgetMs?: number; onRide?: (rec: R) => void } = {},
): Promise<{ asked: number; changed: number; left: number }> {
  const GEO_FILE = geoCellsFile(root);
  // The place cache is written here only.
  const cells = (readJSON(GEO_FILE, {}) || {}) as GeoCells;
  const rides = recs.filter((r): r is R & { summary: ActivitySummary & { summary_polyline: string } } => isGeoRide(r.summary));
  const todo: string[] = [];
  const seen = new Set<string>();
  for (const r of rides) for (const k of routeCells(r.summary.summary_polyline)) if (!(k in cells) && !seen.has(k)) { seen.add(k); todo.push(k); }

  const t0 = Date.now();
  let asked = 0, failed = 0, stopped = false;
  if (todo.length) log(`🌍 Places: ${todo.length} new map cells (≈ ${Math.ceil((todo.length * GAP_MS) / 60000)} min at 1 request/s)`);
  for (const k of todo) {
    if (budgetMs && Date.now() - t0 > budgetMs) { stopped = true; break; }
    const t = Date.now();
    try { cells[k] = await reverse(cellCenter(k)); asked++; }
    catch (e) { failed++; if (failed >= 5) { log(`⚠️  Geocoding aborted: ${errorMessage(e)}`); stopped = true; break; } }
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
