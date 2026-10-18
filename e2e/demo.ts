import fs from 'node:fs';
import path from 'node:path';
import { demoDayShift, shiftRideDates } from '../src/lib/demo-clock.js';
import { readDemoRides, rideYears } from '../scripts/lib/screenshots.mjs';

// The demo dataset as the build sees it, known when the tests are collected – so a check per page
// can be its own test (one test looping over every page outgrows its time budget under load).
// The specs compare these lists with what the pages link to.
const DEMO = path.resolve(import.meta.dirname, '..', 'demo');
const meta = JSON.parse(fs.readFileSync(path.join(DEMO, 'data', 'meta.json'), 'utf8'));
// Same clock as src/lib/data.js: demo dates move forward in whole weeks up to today
const shift = demoDayShift(meta.newest_day, new Date());

/** Years of the demo rides, newest first. */
export const DEMO_YEARS = rideYears(readDemoRides(path.join(DEMO, 'rides')).map((r) => shiftRideDates(r, shift)))
  .map(Number).sort((a, b) => b - a);

/** Paths of the demo bike pages. */
export const DEMO_BIKE_PATHS = fs.readdirSync(path.join(DEMO, 'gear')).filter((f) => f.endsWith('.md'))
  .map((f) => `/gear/${f.replace(/\.md$/, '')}/`).sort();
