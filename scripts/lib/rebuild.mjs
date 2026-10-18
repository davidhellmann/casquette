import { ROOT } from './env.mjs';
import { writeGear } from './gear-file.mjs';
import { createRideStorage, loadRideStorageContext } from './ride-storage.mjs';

/** Local-only rebuild. No auth, environment loading, geocoding or stream/network access. */
export function rebuild({ root = ROOT } = {}) {
  const context = loadRideStorageContext({ root });
  const storage = createRideStorage({ root, ...context });
  for (const gear of Object.values(context.gear)) writeGear(gear, { rebuild: true, root });
  const rides = storage.list();
  for (const rec of rides) storage.save(rec);
  return rides.length;
}
