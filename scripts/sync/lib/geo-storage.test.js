import fs from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const { root, geocodeRides } = vi.hoisted(() => ({
  root: `${process.cwd()}/logs/t09-geo-fixture`,
  geocodeRides: vi.fn(async (recs, { onRide }) => {
    for (const rec of recs) { rec.geo = { countries: ['Austria'] }; onRide(rec); }
    return { changed: recs.length };
  }),
}));
vi.mock('../../shared/env.mjs', async (original) => ({ ...await original(), ROOT: root, loadEnv: () => { throw new Error('No env allowed'); } }));
vi.mock('./geo.mjs', () => ({ geocodeRides }));
vi.mock('./strava.mjs', () => { throw new Error('No Strava import allowed'); });
import { createRideStorage } from './ride-storage.mjs';
import { createAthleteStorage } from './athlete-storage.mjs';
import { rebuild } from './rebuild.mjs';

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
it('standalone geo saves through the same public ride storage; offline rebuild is byte-identical', async () => {
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data/athlete.json'), JSON.stringify({ zones: {}, gear: [{ id: 'b7', name: 'Geo bike', type: 'bike' }] }));
  const store = createRideStorage({ gear: createAthleteStorage().gear().byId });
  store.save({ id: '7', summary: { start_date_local: '2024-05-01T12:00:00', gear_id: 'b7' }, detail: { description: 'Description' } });
  await import('../geo.mjs');
  expect(geocodeRides).toHaveBeenCalledOnce();
  expect(store.read('7').geo).toEqual({ countries: ['Austria'] });
  const file = path.join(root, store.read('7').file);
  const before = fs.readFileSync(file, 'utf8');
  expect(before).toContain('gear_name: "Geo bike"');
  expect(before).toContain('Description');
  expect(before).toContain('Austria');
  rebuild();
  expect(fs.readFileSync(file, 'utf8')).toBe(before);
});
