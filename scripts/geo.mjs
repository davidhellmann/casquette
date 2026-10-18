#!/usr/bin/env node
/**
 * Resolve places and countries for all outdoor rides (no time limit, 0 Strava calls).
 *   npm run geo
 * The first run takes ~1 h (1 request/s to OpenStreetMap Nominatim), afterwards only seconds.
 * Safe to cancel at any time – the next run continues where it left off.
 */
import { log } from './lib/env.mjs';
import { geocodeRides } from './lib/geo.mjs';
import { createRideStorage, loadRideStorageContext } from './lib/ride-storage.mjs';

const storage = createRideStorage(loadRideStorageContext());
const recs = storage.list()
  .filter((r) => r.summary)
  .sort((a, b) => String(b.summary.start_date).localeCompare(String(a.summary.start_date)));

const { changed } = await geocodeRides(recs, {
  onRide: (rec) => storage.save(rec),
});
log(`✅ Done – ${changed} rides with new places.`);
