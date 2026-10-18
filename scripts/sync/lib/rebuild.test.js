import fs from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const { root } = vi.hoisted(() => ({ root: `${process.cwd()}/logs/t07-rebuild-test` }));
vi.mock('../../shared/env.mjs', async (original) => ({ ...await original(), ROOT: root, loadEnv: () => { throw new Error('Offline must not load secrets'); } }));
vi.mock('./strava.mjs', () => { throw new Error('Offline must not import Strava'); });
vi.mock('./geo.mjs', () => { throw new Error('Offline must not import geocoding'); });
import { rebuild } from './rebuild.mjs';
import { writeGear } from './gear-file.mjs';

const put = (name, text) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const get = (name) => fs.readFileSync(path.join(root, name), 'utf8');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('rebuild reads only the local cache, removes old derived values, keeps ride body and gear custom/body, is idempotent', () => {
  put('src/data/athlete.json', JSON.stringify({ zones: { ftp: 200 }, profile: { weight: 80 }, gear: [{ id: 'b7', name: 'Bike', type: 'bike' }] }));
  put('.strava-cache/activities/7.json', JSON.stringify({ id: '7', summary: { start_date_local: '2024-05-01T12:00:00', device_watts: true, weighted_average_watts: 220 },
    detail: { description: 'stale cache body' }, metrics: { source: 'summary', np: 220, tss: 999, intensity_factor: 9, avg_wkg: 9, np_wkg: 9, ftp_used: 300, time_in_power_zones: [10, 20] } }));
  const ride = 'src/content/rides/2024/2024-05-01_7.md';
  put(ride, '---\nid: "7"\n---\n\nMy own text\n');
  put('src/content/gear/b7.md', '---\nid: "b7"\ncustom:\n  notes: "keep" # comment\n---\n\nBike history\n');
  expect(rebuild()).toBe(1);
  const first = get(ride), gear = get('src/content/gear/b7.md');
  expect(first).not.toMatch(/\b(tss|intensity_factor|avg_wkg|np_wkg|ftp_used):/);
  expect(first).toContain('time_in_power_zones_basis:');
  expect(first).toContain('np: 220');
  expect(first).toContain('My own text');
  expect(first).not.toContain('stale cache body');
  expect(gear).toContain('custom:\n  notes: "keep" # comment\n');
  expect(gear).toContain('\n\nBike history\n');
  expect(rebuild()).toBe(1);
  expect(get(ride)).toBe(first);
  expect(get('src/content/gear/b7.md')).toBe(gear);
});

it('also keeps a deliberately empty gear body', () => {
  put('src/content/gear/b8.md', '---\nid: "b8"\ncustom:\n  notes: null\n---\n');
  writeGear({ id: 'b8', name: 'Bike', type: 'bike' }, { rebuild: true });
  expect(get('src/content/gear/b8.md')).toMatch(/---\n$/);
});

it('the offline CLI imports neither auth nor geocoding and loads no secrets', async () => {
  await import('../strava-rebuild.mjs');
});
