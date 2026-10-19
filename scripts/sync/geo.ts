#!/usr/bin/env node
/**
 * Resolve places and countries for all outdoor rides (no time limit, 0 Strava calls).
 *   npm run geo
 * The first run takes ~1 h (1 request/s to OpenStreetMap Nominatim), afterwards only seconds.
 * Safe to cancel at any time – the next run continues where it left off.
 */
import { log } from '../shared/env.ts';
import { geocodeRides } from './lib/geo.ts';
import { createRideStorage } from './lib/ride-storage.ts';
import { createAthleteStorage } from './lib/athlete-storage.ts';

const storage = createRideStorage({ gear: createAthleteStorage().gear().byId });
const { changed } = await geocodeRides(storage.list(), {
  onRide: (rec) => storage.save(rec),
});
log(`✅ Done – ${changed} rides with new places.`);
