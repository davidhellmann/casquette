// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { athleteTimeline } from '../training/index.ts';
import { processRide, tizTotal } from './index.ts';

const timeline = athleteTimeline({ history: [{ date: '2024-01-01', ftp: 200, weight: 80 }, { date: '2024-06-01', ftp: 300, weight: 75 }] });
const DIST = { version: 1, method: 'right-sample-dt-0-10s', samples: [[150, 1800], [250, 1800]] };
const HR = { version: 1, method: 'right-sample-dt-0-10s', samples: [[120, 600], [140, 3000]] };
const ride = (id, date, metrics = {}) => {
  const a = { id, start_date_local: `${date}T12:00:00`, sport_type: 'Ride', moving_time: 3600, device_watts: true, average_watts: 200, metrics };
  return processRide(a, timeline.at(a.start_date_local));
};

describe('tizTotal – time in zones of a set of rides', () => {
  it('sums the zones of rides sharing one set of boundaries and reports them', () => {
    const T = tizTotal([ride('a', '2024-02-01', { power_distribution: DIST }), ride('b', '2024-03-01', { power_distribution: DIST })], 'power');
    expect(T.seconds).toEqual([0, 3600, 0, 0, 0, 3600, 0]);
    expect(T).toMatchObject({ total: 7200, rides: 2, sources: { distribution: 2 }, legacyCount: 0, mixed: false, exact: true });
    expect(T.zones).toHaveLength(7);
    expect(T.zones[1]).toMatchObject({ min: 111 });
  });

  it('flags different boundaries (another FTP) as mixed, without shared boundaries', () => {
    const T = tizTotal([ride('a', '2024-02-01', { power_distribution: DIST }), ride('b', '2024-07-01', { power_distribution: DIST })], 'power');
    expect(T).toMatchObject({ total: 7200, mixed: true, zones: null, exact: true, legacyCount: 0 });
  });

  it('counts legacy TIZ, which has unknown boundaries, and is never exact', () => {
    const legacy = ride('legacy', '2024-02-02', { time_in_power_zones: [0, 1800, 1800], ftp_used: 250 });
    const T = tizTotal([ride('a', '2024-02-01', { power_distribution: DIST }), legacy], 'power');
    expect(T.seconds).toEqual([0, 3600, 1800, 0, 0, 1800, 0]);
    expect(T).toMatchObject({ rides: 2, sources: { distribution: 1, legacy: 1 }, legacyCount: 1, mixed: true, zones: null, exact: false });
    expect(T.bases.map((b) => b.ftp)).toEqual([200, 250]);
  });

  it('works per basis: HR from distributions and stored at sync', () => {
    const stored = ride('stored', '2024-02-02', { time_in_hr_zones: [600, 600, 0, 0, 0, 99], time_in_hr_zones_basis: { zones: [{ min: 0, max: 130 }] } });
    const T = tizTotal([ride('a', '2024-02-01', { hr_distribution: HR }), stored], 'hr');
    expect(T.seconds).toHaveLength(5);
    expect(T.seconds).toEqual([1200, 3600, 0, 0, 0]);
    expect(T).toMatchObject({ sources: { distribution: 1, sync: 1 }, legacyCount: 0, mixed: true, exact: false });
  });

  it('returns zeros without rides with TIZ', () => {
    expect(tizTotal([ride('none', '2024-02-01')], 'power')).toMatchObject({ seconds: [0, 0, 0, 0, 0, 0, 0], total: 0, rides: 0, mixed: false, zones: null, exact: false, legacyCount: 0 });
    expect(() => tizTotal([], 'speed')).toThrow('basis');
  });
});
