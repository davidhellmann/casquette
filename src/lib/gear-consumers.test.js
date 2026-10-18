import { expect, it, vi } from 'vitest';
import { decodeDashboard, encodeDashboard } from './dashboard-payload.js';
import { dashboardPeriod } from '../dashboard-period/index.js';

const fixtures = vi.hoisted(() => ({
  gear: [
    { id: 'b1', type: 'bike', distance: 110000, custom: { price_eur: 1000 } },
    { id: 'b2', type: 'bike', distance: 20000 },
    { id: 'b3', type: 'bike', distance: 999999, retired: true },
  ],
  rides: [
    ['human', 'Ride', 'b1', 10000], ['electric', 'EBikeRide', 'b1', 100000],
    ['human2', 'Ride', 'b2', 20000], ['emtb', 'EMountainBikeRide', 'b3', 999999],
  ].map(([id, sport_type, gear_id, distance]) => ({ id, sport_type, gear_id, distance, start_date_local: '2024-06-01T12:00:00', start_date: '2024-06-01T10:00:00Z' })),
}));
// Real synced data (not the demo dataset) – see data-source.js.
vi.mock('./data-source.js', () => ({ selectDataSource: () => ({ demo: false, ridesDir: 'src/content/rides', gearDir: 'src/content/gear', streamsDir: 'public/streams', dataDir: 'src/data' }) }));
vi.mock('astro:content', () => ({ getCollection: async (name) => fixtures[name].map(data => ({ data })) }));
vi.mock('node:fs', () => ({ default: { existsSync: () => false, readFileSync: () => JSON.stringify({ gear: fixtures.gear }) } }));

it('bike pages and dashboard garage use stat ride km for total, cost and ranking', async () => {
  const { loadRides, loadGear, loadAthlete } = await import('./data.js');
  const gear = await loadGear();
  expect(gear.map(g => g.id)).toEqual(['b2', 'b1', 'b3']);
  expect(gear.find(g => g.id === 'b1')).toMatchObject({ kmTotal: 10, costPerKm: 100, t: { km: 10, n: 1 } });
  expect(gear.find(g => g.id === 'b3')).toMatchObject({ kmTotal: 0, costPerKm: null });
  const source = decodeDashboard(encodeDashboard({ rides: await loadRides(), athlete: loadAthlete() }));
  const d = dashboardPeriod(source.rides, { days: 30, basis: 'power', now: new Date('2024-06-02T12:00:00Z'), gear: source.athlete.gear });
  expect(d.garage.total).toBe(30000);
  expect(d.garage.max).toBe(20000);
  expect(d.garage.active.map(g => [g.id, g.statsDistance])).toEqual([['b2', 20000], ['b1', 10000]]);
  expect(d.garage.retired[0].statsDistance).toBe(0);
  expect(d.log).toHaveLength(4);
  expect(d.S.n).toBe(2);
});
