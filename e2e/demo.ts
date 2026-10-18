import { readDemoDataset, rideYears } from '../scripts/lib/demo-dataset.mjs';

// The demo dataset as the build sees it (dates moved by the demo clock up to today), known when the
// tests are collected – so a check per page can be its own test (one test looping over every page
// outgrows its time budget under load). The specs compare these lists with what the pages link to.
const demo = readDemoDataset({ today: new Date() });

/** Years of the demo rides, newest first. */
export const DEMO_YEARS = rideYears(demo.rides);

/** Paths of the demo bike pages. */
export const DEMO_BIKE_PATHS = demo.gear.map((id) => `/gear/${id}/`).sort();
