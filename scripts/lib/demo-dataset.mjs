// The demo dataset (demo/, GLOSSARY "Demo data") as a build sees it, for the tooling around the demo
// build: screenshots, UI fragments, the demo build check and the e2e tests. Read-only; the generator
// (demo-data.mjs) writes it, src/lib/data.js is the app's own reader.
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_DIR } from '../../src/lib/data-source.js';
import { demoDayShift, shiftRideDates } from '../../src/lib/demo-clock.js';
import { ROOT } from './env.mjs';

/**
 * The attribute the app renders (on the sidebar's demo indicator) only while it shows the demo
 * dataset – the privacy guard of every capture and of the demo build check.
 */
export const DEMO_MARKER = 'data-demo-note';

/** Scalar frontmatter value: JSON where it parses (the ride writer double-quotes strings), else the raw text. */
function scalar(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * The part of a ride file's frontmatter the tooling needs: the top-level `key: value` scalars and
 * the segment ids of `segment_efforts`. The only frontmatter parsing in this module.
 */
function rideFrontmatter(text) {
  const front = text.split('\n---')[0];
  const ride = {};
  for (const [, key, raw] of front.matchAll(/^([a-z_]+): (.+)$/gm)) ride[key] = scalar(raw);
  const segments = [...front.matchAll(/^\s+segment_id: (.+)$/gm)].map((m) => ({ segment_id: String(scalar(m[1])) }));
  if (segments.length) ride.segment_efforts = segments;
  return ride;
}

/** Files in `dir` (recursively, '/'-separated relative paths) ending in `ext`; none if it doesn't exist. */
function files(dir, ext, recursive = false) {
  let entries;
  try { entries = fs.readdirSync(dir, { recursive }); } catch { return []; }
  return entries.map(String).filter((f) => f.endsWith(ext) && fs.statSync(path.join(dir, f)).isFile()).sort();
}

/**
 * Reads the demo dataset below `root` as a build on `today` sees it: ride dates moved forward by the
 * demo clock exactly like src/lib/data.js does (src/lib/demo-clock.js).
 * @returns {{ dir: string, meta: object, shift: number, rides: object[], gear: string[], streams: string[] }}
 *   the dataset folder, demo/data/meta.json, the shift in days, the rides (frontmatter scalars and
 *   segment ids, sorted by file), the bike ids and the ids of the rides with chart streams
 */
export function readDemoDataset({ root = ROOT, today = new Date() } = {}) {
  const dir = path.join(root, DEMO_DIR);
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'meta.json'), 'utf8')); } catch { meta = {}; }
  const shift = demoDayShift(meta.newest_day, today);
  const ridesDir = path.join(dir, 'rides');
  const rides = files(ridesDir, '.md', true).map((f) => shiftRideDates(rideFrontmatter(fs.readFileSync(path.join(ridesDir, f), 'utf8')), shift));
  const ids = (sub, ext) => files(path.join(dir, sub), ext).map((f) => f.slice(0, -ext.length));
  return { dir, meta, shift, rides, gear: ids('gear', '.md'), streams: ids('streams', '.json') };
}

/** The years that have rides (each one has a year-review page), from the local start dates, newest first. */
export function rideYears(rides) {
  const years = new Set(rides.map((r) => String(r.start_date_local ?? '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)));
  return [...years].map(Number).sort((a, b) => b - a);
}

/** The year to show as a year review: the last complete year (the running one is still half empty). */
export function reviewYear(rides) {
  const years = rideYears(rides);
  return years[1] ?? years[0];
}

/**
 * The ride to show as a ride page (needs a route map plus power and heart-rate charts): the newest
 * outdoor ride (ids sort chronologically) that has all three.
 */
export function heroRide(rides) {
  const hero = rides
    .filter((r) => !r.trainer && r.device_watts && r.has_heartrate && r.summary_polyline)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  if (!hero) throw new Error('No ride with route, power and heart rate for the ride page.');
  return hero.id;
}
