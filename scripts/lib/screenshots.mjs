// Refs #14, #41: which product screenshots exist and how they are framed.
// Config + helpers (shared with e2e/screenshots.spec.ts); the browser driver lives in scripts/screenshots.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from './ride-file.mjs';

/** Every capture uses the same viewport and pixel density (2880×1800 output). */
export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };
export const THEMES = ['light', 'dark'];

/**
 * Key views. `{ride}` / `{year}` are filled in by planShots; `focus` (a selector, usually a
 * `data-testid` of a card or dashboard section) scrolls that element to the top of the viewport
 * for close-ups. Without `focus` the top of the page is shot.
 */
export const SHOTS = [
  { name: 'dashboard', path: '/' },
  { name: 'ride', path: '/rides/{ride}' },
  { name: 'ride-charts', path: '/rides/{ride}', focus: '[data-testid="ride-streams"]' },
  { name: 'map', path: '/map' },
  { name: 'year', path: '/years/{year}' },
  { name: 'performance', path: '/performance' },
  { name: 'zones', path: '/', focus: '[data-testid="dash-intensity"]' },
];

/**
 * The ride-detail shot needs a route map plus power and heart-rate charts:
 * newest outdoor ride (ids sort chronologically) that has all three.
 */
export function pickHeroRide(rides) {
  const hero = rides
    .filter((r) => !r.trainer && r.device_watts && r.has_heartrate && r.summary_polyline)
    .sort((a, b) => b.id.localeCompare(a.id))[0];
  if (!hero) throw new Error('No ride with route, power and heart rate for the ride-detail shot.');
  return hero.id;
}

/** Top-level `key: value` scalars of each demo ride's frontmatter (enough for pickHeroRide and rideYears). */
export function readDemoRides(dir) {
  return fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => {
    const front = splitFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'))?.front ?? '';
    const ride = {};
    for (const [, key, raw] of front.matchAll(/^([a-z_]+): (.+)$/gm)) {
      ride[key] = raw === 'true' ? true : raw === 'false' ? false : raw.replace(/^"|"$/g, '');
    }
    return ride;
  });
}

/** Headless Chromium/Chrome binary: `CHROME_PATH` wins, else the first installed candidate. */
export function findBrowser({ env, candidates, exists }) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const found = candidates.find((p) => exists(p));
  if (!found) throw new Error('No Chromium or Chrome found. Set CHROME_PATH to a Chromium-based browser binary.');
  return found;
}

/** The years that have rides (each one has a year-review page), from the local start dates. */
export function rideYears(rides) {
  return [...new Set(rides.map((r) => String(r.start_date_local ?? '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))];
}

/** Year-review shot: the last complete year (the running one is still half empty). */
export function reviewYear(years) {
  const sorted = years.map(Number).sort((a, b) => b - a);
  return sorted[1] ?? sorted[0];
}

/** One capture per shot and theme, with the URL resolved against the preview server. */
export function planShots({ baseUrl, ride, year, shots = SHOTS, themes = THEMES }) {
  const base = baseUrl.replace(/\/$/, '');
  return shots.flatMap((shot) => {
    const url = base + shot.path.replace('{ride}', ride).replace('{year}', String(year));
    return themes.map((theme) => ({ file: `${shot.name}-${theme}.webp`, url, theme, focus: shot.focus ?? null }));
  });
}
