import { ROOT } from '../../shared/env.mjs';
import { writeGear } from './gear-file.mjs';
import { createRideStorage } from './ride-storage.mjs';
import { createAthleteStorage } from './athlete-storage.mjs';

/** Local-only rebuild. No auth, environment loading, geocoding or stream/network access. */
export function rebuild({ root = ROOT } = {}) {
  const gear = createAthleteStorage({ root }).gear().byId;
  const storage = createRideStorage({ root, gear });
  for (const g of Object.values(gear)) writeGear(g, { rebuild: true, root });
  const rides = storage.list();
  for (const rec of rides) storage.save(rec);
  return rides.length;
}
