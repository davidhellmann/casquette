import { ROOT } from '../../shared/env.ts';
import { writeGear } from './gear-file.ts';
import { createRideStorage } from './ride-storage.ts';
import { createAthleteStorage } from './athlete-storage.ts';

/** Local-only rebuild. No auth, environment loading, geocoding or stream/network access. */
export function rebuild({ root = ROOT }: { root?: string } = {}): number {
  const gear = createAthleteStorage({ root }).gear().byId;
  const storage = createRideStorage({ root, gear });
  for (const g of Object.values(gear)) writeGear(g, { rebuild: true, root });
  const rides = storage.list();
  for (const rec of rides) storage.save(rec);
  return rides.length;
}
