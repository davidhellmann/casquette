import { ROOT } from './env.mjs';
import { writeGear } from './store.mjs';
import { createRideStorage, loadRideStorageContext } from './ride-storage.mjs';

/** Local-only rebuild. No auth, environment loading, geocoding or stream/network access. */
export function rebuild({ root = ROOT } = {}) {
  const context = loadRideStorageContext({ root });
  const storage = createRideStorage({ root, ...context });
  for (const gear of Object.values(context.gear)) writeGear(gear, { rebuild: true, root });
  let n = 0;
  for (const rec of storage.list()) {
    if (!rec.summary) continue;
    storage.save(rec);
    n++;
  }
  return n;
}
