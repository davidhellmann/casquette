// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from './dataset-fixture.ts';
import { ridePayload } from './ride-payload.ts';
import { routes } from './routes.ts';
import { cogganZones } from '../training/index.ts';

describe('ridePayload', () => {
  it('links the ride to its neighbours in ride order, its bike and the map places', async () => {
    const data = await fixtureDataset();
    const R = ridePayload(data, { id: 'demo-0002' });
    expect(R).toMatchObject({
      id: 'demo-0002', name: 'Demo ride 2', kind: 'Outdoor · GravelRide', indoor: false, inStats: true,
      older: { href: routes.ride('demo-0001'), name: 'Demo ride 1' },
      newer: { href: routes.ride('demo-0003'), name: 'Demo ride 3' },
      gear: { name: 'Gravel bike', href: routes.gear('bdemo1') },
      strava: null, // demo ids never link to strava.com
    });
    expect(ridePayload(data, { id: 'demo-0005' }).newer).toBeNull();
    expect(ridePayload(data, { id: 'demo-0001' })).toMatchObject({
      older: null,
      places: [{ name: 'Hilltown', href: routes.map({ country: 'NZ', place: 'Hilltown' }), title: 'North, NZ' }],
    });
  });

  it('marks new power bests against every other admitted stat ride, later ones included', async () => {
    const data = await fixtureDataset();
    // 5 s 850 W, 20 min 280 W and 60 min beat every other stat ride; 1 min 380 W is below demo-0001's 400 W.
    // The e-bike's 1200 W and the not-yet-started ride's 999 W do not count.
    expect(ridePayload(data, { id: 'demo-0002' }).newBests).toBe('5 s, 20 min, 1 h');
    // demo-0001's 1 min holds, although it is older than demo-0002
    expect(ridePayload(data, { id: 'demo-0001' }).newBests).toBe('1 min');
    const { curve } = ridePayload(data, { id: 'demo-0002' });
    expect(curve.allTime).toEqual({ 5: 800, 60: 400, 1200: 270 });
    expect(curve.year).toEqual({ 5: 700 });
    expect(curve.wkg.own).toEqual({ 5: 12.14, 60: 5.43, 1200: 4, 3600: 3.57 }); // 70 kg on the ride date
    expect(curve.wkg.allTime).toEqual({ 5: 11.11, 60: 5.56, 1200: 3.75 }); // 72 kg back then
  });

  it('colours the route by the streams when they have GPS, else draws the summary polyline', async () => {
    const data = await fixtureDataset();
    const withStreams = ridePayload(data, { id: 'demo-0002' });
    expect(withStreams.map).toEqual({ streams: true, points: null, key: 'watts', zones: cogganZones(260) });
    expect(withStreams.streamZones.watts).toEqual(cogganZones(260));
    const summary = ridePayload(data, { id: 'demo-0001' }).map;
    expect(summary).toMatchObject({ streams: false, key: null, zones: null });
    expect(summary.points).toHaveLength(3);
    expect(ridePayload(data, { id: 'demo-0003' }).map).toEqual({ streams: false, points: null, key: null, zones: null });
  });

  it('carries the key data, analysis and tables of the ride', async () => {
    const R = ridePayload(await fixtureDataset(), { id: 'demo-0001' });
    expect(R.stats).toMatchObject({ distance: 50, moving: 7200, elapsed: 7800, elev: 600, elevLow: 12.4, elevHigh: 512, kg: 72, ftp: 240 });
    expect(R).toMatchObject({ device: 'Head unit', ftp: 240, year: 2023, analysis: { rpe: 6, if_: 220 / 240 } });
    expect(R.laps.map((l) => [l.index, l.name, l.distance, l.max_heartrate])).toEqual([[1, 'Lap 1', 25000, null], [2, 'Lap 2', 25000, null]]);
    expect(R.splits.map((s) => s.split)).toEqual([1, 2]);
    expect(R.segments).toEqual([{ name: 'Hill', distance: 2000, average_grade: 5, elapsed_time: 320, average_watts: 260, average_heartrate: null, pr_rank: null, key: '0', href: null }]);
    // Indoor rides have no splits
    expect(ridePayload(await fixtureDataset(), { id: 'demo-0003' }).splits).toEqual([]);
  });

  it('fails for an unknown ride', async () => {
    const data = await fixtureDataset();
    expect(() => ridePayload(data, { id: 'nope' })).toThrow('No ride nope');
  });
});
