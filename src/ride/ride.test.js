import { describe, expect, it } from 'vitest';
import { athleteTimeline } from '../training/index.js';
import { processRide } from './index.js';

const timeline = athleteTimeline({ history: [
  { date: '2024-01-01', ftp: 200, weight: 80 },
  { date: '2024-06-01', ftp: 300, weight: 75 },
] });
const raw = (overrides = {}) => ({
  id: 42, start_date_local: '2024-05-01T12:00:00', sport_type: 'Ride',
  moving_time: 3600, device_watts: true, average_watts: 180, average_heartrate: 150,
  suffer_score: 90, metrics: { np: 240, ftp_used: 400, tss: 999, intensity_factor: 9, efficiency_factor: 9 },
  ...overrides,
});
const process = (overrides) => {
  const a = raw(overrides);
  return processRide(a, timeline.at(a.start_date_local));
};

describe('Ride – public, pure processing', () => {
  it('derives IF, TSS, EF, load and both zones from the athlete state on the date', () => {
    expect(process()).toMatchObject({ np: 240, ftp: 200, kg: 80, if_: 1.2, tss: 144, ef: 1.6, load: 144,
      clsP: { zone: 3, source: 'power' }, clsH: { zone: 3, source: 'hr' } });
    expect(process({ start_date_local: '2024-06-01T12:00:00' })).toMatchObject({
      ftp: 300, kg: 75, if_: 0.8, tss: 64, load: 64, clsP: { zone: 2, source: 'power' },
    });
  });

  it('prefers stored NP, then measured weighted_average_watts, never average watts for IF/TSS/EF', () => {
    expect(process({ weighted_average_watts: 200 }).np).toBe(240);
    expect(process({ metrics: {}, weighted_average_watts: 200 })).toMatchObject({ np: 200, if_: 1, tss: 100, ef: 1.333 });
    expect(process({ metrics: {} })).toMatchObject({ w: 180, np: null, if_: null, tss: null, ef: null, load: 90 });
    // Do not carry the dashboard's 20-minute filter into the build.
    expect(process({ moving_time: 600 }).ef).toBe(1.6);
  });

  it('ignores estimated summary watts, but not existing stream NP', () => {
    expect(process({ device_watts: false, weighted_average_watts: 250, metrics: {} })).toMatchObject({
      w: null, np: null, tss: null, clsP: { zone: 3, source: 'hr' },
    });
    expect(process({ device_watts: false })).toMatchObject({ w: null, np: 240, tss: 144 });
    expect(process({ average_heartrate: null })).toMatchObject({ clsH: { source: 'power', zone: 3 }, ef: null });
  });

  it('makes the HR/power fallback and the effort estimate explicit', () => {
    expect(process({ has_heartrate: false })).toMatchObject({ hr: null, ef: null, clsH: { source: 'power' } });
    expect(process({ device_watts: false, has_heartrate: false, metrics: {} })).toMatchObject({
      clsP: { source: 'effort', zone: 3 }, clsH: { source: 'effort', zone: 3 }, load: 90,
    });
    expect(process({ device_watts: false, has_heartrate: false, metrics: {}, suffer_score: null })).toMatchObject({
      clsP: { source: 'none', zone: null }, clsH: { source: 'none', zone: null }, load: 0,
    });
  });

  it.each([[34, 1], [35, 2], [70, 3], [110, 4]])('estimates effort %s per hour as Z%s', (suffer_score, zone) => {
    expect(process({ device_watts: false, has_heartrate: false, metrics: {}, suffer_score }).clsP)
      .toMatchObject({ zone, source: 'effort' });
  });

  it('prefers each basis its own measurement and computes no effort zone without duration', () => {
    expect(process({ average_heartrate: 175 })).toMatchObject({
      clsP: { zone: 3, source: 'power' }, clsH: { zone: 4, source: 'hr' },
    });
    expect(process({ device_watts: false, has_heartrate: false, moving_time: 0, metrics: {} })).toMatchObject({
      load: 90, clsP: { zone: null, source: 'none' },
    });
  });

  it('distinguishes missing values from zero: 0 TSS displaces Relative Effort', () => {
    expect(process({ average_watts: 0, metrics: { np: 0 } })).toMatchObject({
      w: 0, np: 0, if_: 0, tss: 0, ef: 0, load: 0, clsP: { zone: 1, source: 'power' },
    });
    expect(process({ moving_time: 0 })).toMatchObject({ tss: 0, load: 0 });
    expect(process({ average_heartrate: 0 }).ef).toBeNull();
    expect(process({ device_watts: false, has_heartrate: false, metrics: {}, suffer_score: 0 })).toMatchObject({
      load: 0, clsP: { zone: null, source: 'none' },
    });
  });

  it.each(['EBikeRide', 'EMountainBikeRide'])('keeps %s as a ride, but not as a stat ride', (sport_type) => {
    expect(process({ sport_type })).toMatchObject({ id: '42', stats: false, tss: 144 });
    expect(process().stats).toBe(true);
  });

  it('keeps legacy TIZ and sync FTP without inventing historical histogram boundaries from FTP', () => {
    const metrics = Object.freeze({ np: 240, ftp_used: 400, time_in_power_zones: Object.freeze([60, 120]), time_in_hr_zones: Object.freeze([100, 80]) });
    const a = Object.freeze(raw({ metrics }));
    const r = processRide(a, timeline.at(a.start_date_local));
    expect(r).toMatchObject({ ftp: 200, tizP: [60, 120], tizH: [100, 80],
      tizBasis: { power: { ftp: 400, zones: null }, hr: { zones: null } },
    });
    expect(r.tizBasis.power).toEqual({ source: 'legacy', ftp: 400, zones: null, exact: false });
    expect(process({ metrics: { time_in_power_zones: [100] } }).tizBasis.power).toMatchObject({ ftp: null, zones: null });
  });

  it('keeps HR time in zones stored at sync for rides without an HR distribution and marks it as stored', () => {
    const zones = [{ min: 0, max: 139 }, { min: 140, max: null }];
    const r = process({ metrics: { time_in_hr_zones: [100, 80], time_in_hr_zones_basis: { source: 'sync', zones } } });
    expect(r.tizH).toEqual([100, 80]);
    expect(r.tizBasis.hr).toMatchObject({ source: 'sync', zones, exact: false });
    expect(r.tizBasis.hr).not.toHaveProperty('label');
  });

  it('returns codes only – no localised text – and names a ride without a name "Ride"', () => {
    const r = process({ name: '' });
    expect(r.name).toBe('Ride');
    for (const key of ['clsP', 'clsH']) expect(Object.keys(r[key]).sort()).toEqual(['source', 'zone']);
    for (const kind of ['power', 'hr']) expect(r.tizBasis[kind]).not.toHaveProperty('label');
  });
});
