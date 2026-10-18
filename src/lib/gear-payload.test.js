import { describe, expect, it } from 'vitest';
import { fixtureDataset, NOW } from './dataset-fixture.js';
import { gearIndexPayload, gearPayload } from './gear-payload.ts';
import { routes } from './routes.js';

describe('gearIndexPayload', () => {
  it('lists active bikes first with their admitted stat ride totals, and shoes with their Strava distance', async () => {
    const P = gearIndexPayload(await fixtureDataset());
    expect(P.bikes.map((b) => [b.id, b.href, b.km, b.rides, b.retired, b.lastRide])).toEqual([
      ['bdemo1', routes.gear('bdemo1'), 100, 2, false, '2024-04-20'],
      ['bdemo2', routes.gear('bdemo2'), 50, 1, true, '2024-06-14'],
    ]);
    expect(P.bikes[0]).toMatchObject({ sub: 'Gravel · Acme · Dirt', primary: true, costPerKm: 20, years: [{ year: 2023, km: 50 }, { year: 2024, km: 50 }] });
    expect(P.shoes).toEqual([{ id: 'gdemo1', name: 'Shoes', sub: 'Acme', retired: false, km: 120 }]);
    expect(P.perYear.rows).toEqual([{ year: 2023, bdemo1: 50, bdemo2: 0 }, { year: 2024, bdemo1: 50, bdemo2: 50 }]);
    expect(P.perYear.bikes.map((b) => b.id)).toEqual(['bdemo1', 'bdemo2']);
    expect(P.currentYear).toBe(2024);
  });
});

describe('gearPayload', () => {
  it('describes a bike from its custom data, its admitted stat rides and the build calendar', async () => {
    const P = gearPayload(await fixtureDataset(), { id: 'bdemo1' });
    expect(P).toMatchObject({
      name: 'Gravel bike', kind: 'Gravel', brandModel: 'Acme Dirt', retired: false, primary: true, color: 'Grey',
      stravaUrl: null, purchase: '2022-06-15', price: 2000, costPerKm: 20, components: ['1x12'], notes: 'Tubeless',
      stats: { km: 100, rides: 2, hours: 4, elev: 1200, first: '2023-05-10', last: '2024-04-20', indoorShare: 0 },
      currentYear: 2024,
    });
    expect(P.ownedYears).toBeCloseTo((+NOW - +new Date(2022, 5, 15)) / (365 * 86400000), 6);
    expect(P.months).toHaveLength(24);
    expect(P.months.at(-1)).toEqual({ key: '2024-06', km: 0 });
    expect(P.months.find((m) => m.key === '2024-04')).toEqual({ key: '2024-04', km: 50 });
    expect(P.terrains).toEqual([{ terrain: 'gravel', km: 50 }, { terrain: 'road', km: 50 }]);
    // The e-bike ride and the ride that has not started yet are not counted
    expect(P.rides.map((r) => r.id)).toEqual(['demo-0002', 'demo-0001']);
    expect(P.curve).toEqual({ 5: 850, 60: 400, 1200: 280, 3600: 250 });
    expect(P.curveWkg).toEqual({ 5: 12.14, 60: 5.56, 1200: 4, 3600: 3.57 });
    // Ties go to the more recent ride
    expect(P.records.find((r) => r.key === 'longest').ride).toEqual({ href: routes.ride('demo-0002'), name: 'Demo ride 2', date: '2024-04-20', value: 50000 });
  });

  it('describes gear known only from the athlete', async () => {
    const P = gearPayload(await fixtureDataset(), { id: 'gdemo1' });
    expect(P).toMatchObject({ name: 'Shoes', kind: 'Shoe', purchase: null, ownedYears: null, rides: [], stats: { rides: 0, first: null } });
  });
});
