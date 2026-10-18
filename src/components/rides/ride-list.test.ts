// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { processRide } from '../../ride/index.ts';
import { athleteTimeline } from '../../training/index.ts';
import { decodeDashboard, encodeDashboard } from '../../lib/dashboard-payload.ts';
import { rideListSummary, rideRows, rideSearchText, rideTotals } from './ride-list.ts';

const timeline = athleteTimeline({ history: [{ date: '2024-01-01', ftp: 200, weight: 75 }] });
const ride = (overrides = {}) => {
  const a = { id: 1, name: 'Morning loop', start_date_local: '2024-05-01T08:00:00', sport_type: 'Ride',
    moving_time: 9000, distance: 72500, total_elevation_gain: 640, device_watts: true, average_watts: 180,
    average_heartrate: 150, pr_count: 2, metrics: { np: 200 },
    geo: { places: [{ name: 'Carson City', country: 'United States' }, { name: 'Reno', country: 'United States' }] }, ...overrides };
  return processRide(a, timeline.at(a.start_date_local));
};

describe('ride list rows', () => {
  it('builds one row per ride with places, zone, its source and fueling', () => {
    const [row] = rideRows([ride()]);
    expect(row).toEqual({
      id: '1', date: new Date('2024-05-01T08:00:00'), name: 'Morning loop', places: 'Carson City · Reno',
      indoor: false, eBike: null, pr: 2, km: 72.5, time: 9000, elev: 640, w: 180, np: 200, hr: 150,
      zone: 3, zoneBy: 'Avg power: 180 W', tss: 250, fuel: 90,
    });
  });

  it('follows the zone basis of the list', () => {
    const [row] = rideRows([ride()], { basis: 'hr' });
    expect(row).toMatchObject({ zoneBy: 'Avg HR: 150 bpm', zone: expect.any(Number) });
  });

  it('keeps unknown values unknown and labels e-bike rides', () => {
    const [row] = rideRows([ride({ sport_type: 'EMountainBikeRide', device_watts: false, has_heartrate: false, suffer_score: null, metrics: {}, geo: null, name: '' })]);
    expect(row).toMatchObject({ eBike: 'E-MTB', name: 'Ride', places: '', zone: undefined, zoneBy: '–: –', w: undefined, np: undefined, hr: undefined, tss: undefined });
    expect(rideRows([ride({ sport_type: 'EBikeRide' })])[0].eBike).toBe('E-bike');
  });

  it('gives the same rows from build rides and from the dashboard payload', () => {
    const rides = [ride(), ride({ id: 2, start_date_local: '2024-05-02T08:00:00', trainer: true, geo: null })];
    const browser = decodeDashboard(encodeDashboard({ rides })).rides;
    expect(rideRows(browser)).toEqual(rideRows(rides).reverse());
  });
});

describe('ride list search and totals', () => {
  const rows = rideRows([ride(), ride({ id: 2, distance: 27500, moving_time: 1800, total_elevation_gain: 60 })]);

  it('searches name and places', () => {
    expect(rideSearchText(rows[0])).toBe('Morning loop Carson City · Reno');
  });

  it('sums rides, km, hours and elevation', () => {
    expect(rideListSummary(rows)).toBe('2 rides · 100 km · 3.0 h · 700 m');
    expect(rideTotals(rows)).toBe('100 km · 3:00 h');
  });
});
