import { describe, expect, it } from 'vitest';
import { processRide } from '../ride/index.js';
import { athleteTimeline } from '../training/index.js';
import { dashboardRides, hydrateRides } from './dashboard-data.js';
import { evalGoal } from './goals.js';
import { classificationText, dashboardTiz, rideChips } from './dashboard-display.js';

const timeline = athleteTimeline({ history: [
  { date: '2023-01-01', ftp: 200, weight: 100 },
  { date: '2024-01-01', ftp: 300, weight: 75 },
] });
const make = (id, date, overrides = {}) => {
  const a = { id, start_date_local: `${date}T12:00:00`, sport_type: 'Ride',
    moving_time: 3600, distance: 90000, total_elevation_gain: 500,
    device_watts: true, average_watts: 200, average_heartrate: 140,
    metrics: { np: 200, ftp_used: 250, power_curve: { 60: 400 }, time_in_power_zones: [0, 1800], time_in_hr_zones: [0, 900] },
    summary_polyline: 'not-for-dashboard', segment_efforts: [{ id: 1 }], ...overrides };
  return processRide(a, timeline.at(a.start_date_local));
};
const browser = (rides) => hydrateRides(JSON.parse(JSON.stringify(dashboardRides(rides))));

describe('flat ride in the dashboard and in goals', () => {
  it('keeps the ride page\'s historical metrics across two FTP states and hydrates only the date', () => {
    const rides = [make('old', '2023-05-01'), make('new', '2024-05-01')];
    const transported = browser(rides);
    for (const original of rides) {
      const r = transported.find((r) => r.id === original.id);
      for (const key of ['if_', 'tss', 'ef', 'load', 'ftp', 'kg', 'avg_wkg']) expect(r[key]).toEqual(original[key]);
      for (const key of ['clsP', 'clsH']) {
        expect(original[key]).toMatchObject(r[key]);
        expect(classificationText(r, r[key])).toEqual({ src: original[key].src, val: original[key].val });
      }
      expect(rideChips(r)).toEqual(rideChips(original));
      expect(dashboardTiz(r, 'power')).toEqual(dashboardTiz(original, 'power'));
      expect(r.d).toEqual(original.d);
      expect(r).not.toHaveProperty('summary');
      expect(r).not.toHaveProperty('perf');
      expect(r).not.toHaveProperty('polyline');
      expect(r).not.toHaveProperty('segs');
    }
    expect(transported.map((r) => [r.ftp, r.if_, r.tss, r.clsP.zone])).toEqual([[300, 2 / 3, 44, 2], [200, 1, 100, 4]]);
    expect(transported[1].tizBasis.power).toMatchObject({ ftp: 250, zones: null });
  });

  it('keeps 0, missing NP and every zone fallback without substituting average power', () => {
    const rides = browser([
      make('zero', '2024-05-01', { metrics: { np: 0 }, average_cadence: 0, max_heartrate: 0, suffer_score: 99 }),
      make('hr', '2024-05-01', { device_watts: false, metrics: {} }),
      make('power', '2024-05-01', { has_heartrate: false, metrics: {} }),
      make('effort', '2024-05-01', { device_watts: false, has_heartrate: false, suffer_score: 80, metrics: {} }),
      make('none', '2024-05-01', { device_watts: false, has_heartrate: false, metrics: {} }),
    ]);
    expect(rides[0]).toMatchObject({ if_: 0, tss: 0, ef: 0, load: 0, cad: 0, hr_max: 0 });
    expect(rides[1]).toMatchObject({ if_: null, tss: null, ef: null, clsP: { source: 'hr' } });
    expect(rides[2]).toMatchObject({ if_: null, clsH: { source: 'power' } });
    expect(rides[3]).toMatchObject({ clsP: { source: 'effort', zone: 3 } });
    expect(rides[4]).toMatchObject({ clsP: { source: 'none', zone: null } });
  });

  for (const [metric, extra, value] of [
    ['distance', {}, 90], ['time', {}, 1], ['elevation', {}, 500], ['count', {}, 1],
    ['tss', {}, 44], ['long_rides', { min_km: 80 }, 1],
    ['zone_time', { basis: 'power', zone: 2 }, .5], ['zone_time', { basis: 'hr', zone: 2 }, .25],
  ]) it(`evaluates ${metric} ${extra.basis || ''} in the same format, without e-bikes`, () => {
    const rides = browser([make('old', '2023-05-01'), make('new', '2024-05-01'),
      make('ebike', '2024-05-01', { sport_type: 'EBikeRide' }),
      make('emtb', '2024-05-01', { sport_type: 'EMountainBikeRide' })]);
    expect(rides).toHaveLength(4);
    expect(rides.filter((r) => r.stats)).toHaveLength(2);
    const goal = evalGoal({ metric, period: 'year', target: value, ...extra }, rides, new Date('2024-05-03T12:00:00'));
    expect(goal.value).toBe(value);
    expect(goal.done).toBe(true);
    expect(goal.hist.at(-1).v).toBe(metric === 'tss' ? 100 : value);
    expect(goal.streak).toBe(2);
  });

  it('shows missing metrics differently from 0 and never lays ride zones over sync histograms', () => {
    const [zero] = browser([make('zero', '2024-05-01', { metrics: { np: 0 } })]);
    const [unknown] = browser([make('unknown', '2024-05-01', { metrics: {} })]);
    expect(Object.fromEntries(rideChips(zero))).toMatchObject({ 'IF · TSS': '0.00 · 0', EF: '0.000' });
    expect(Object.fromEntries(rideChips(unknown))).toMatchObject({ 'IF · TSS': '– · –', EF: '–' });
    const [legacy] = browser([make('legacy', '2023-05-01')]);
    expect(dashboardTiz(legacy, 'power')).toMatchObject({ label: 'Legacy · Sync FTP 250 W · boundaries not stored' });
    expect(dashboardTiz(legacy, 'power').rows.every((r) => r.range === 'Boundaries unknown')).toBe(true);
    const known = make('known', '2023-05-01');
    known.tizBasis.power = { ftp: 250, zones: [{ min: 0, max: 99 }, { min: 100, max: 160 }], label: 'Stored Strava zones' };
    expect(dashboardTiz(browser([known])[0], 'power')).toMatchObject({ label: 'Stored Strava zones', rows: [{ range: '≤ 99 W' }, { range: '100–160 W' }] });
  });

  it('takes #7 TIZ from the raw power distribution with the historical athlete state and stored HR boundaries', () => {
    const metrics = { np: 200, power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[200, 3600]] },
      time_in_hr_zones: [60, 120], time_in_hr_zones_basis: { zones: [{ min: 0, max: 100 }, { min: 101, max: null }] } };
    const rides = [make('old', '2023-05-01', { metrics }), make('new', '2024-05-01', { metrics })];
    const transported = browser(rides);
    for (const r of transported) {
      const original = rides.find((x) => x.id === r.id);
      expect(r.tizBasis.power).toMatchObject({ exact: true, source: 'distribution', ftp: original.ftp, zones: original.zones.power_zones });
      expect(dashboardTiz(r, 'power')).toEqual(dashboardTiz(original, 'power'));
      expect(dashboardTiz(r, 'hr')).toEqual(dashboardTiz(original, 'hr'));
      expect(r).not.toHaveProperty('power_distribution');
    }
    expect(transported.map((r) => r.tizP)).toEqual([[0, 3600, 0, 0, 0, 0, 0], [0, 0, 0, 3600, 0, 0, 0]]);
    expect(evalGoal({ metric: 'zone_time', zone: 2, period: 'year', target: 1 }, transported, new Date('2024-05-03')).value).toBe(1);
    expect(browser([make('legacy', '2024-05-01')])[0].tizBasis.power.exact).toBe(false);
  });

  it.each([0, 1, 1.5, 3599, 3600, 12345])('transports moving time in seconds only, hours stay exact (%s)', (seconds) => {
    const original = make('duration', '2024-05-01', { moving_time: seconds });
    expect(dashboardRides([original])[0]).not.toHaveProperty('h');
    expect(browser([original])[0].h).toBe(original.h);
  });

  it('sends TIZ provenance only for histograms that actually exist', () => {
    const original = make('hr-tiz', '2024-05-01', { metrics: { time_in_hr_zones: [3600] } });
    const [payload] = dashboardRides([original]);
    expect(payload.tizBasis).not.toHaveProperty('power');
    expect(dashboardTiz(browser([original])[0], 'hr')).toEqual(dashboardTiz(original, 'hr'));
    expect(browser([original])[0].tizP).toBeNull();
  });

  it('omits only the exact unknown default classification', () => {
    const original = make('unknown', '2024-05-01', { device_watts: false, has_heartrate: false, metrics: {} });
    expect(dashboardRides([original])[0]).not.toHaveProperty('clsP');
    expect(browser([original])[0]).toMatchObject({ clsP: { zone: null, source: 'none' }, clsH: { zone: null, source: 'none' } });
  });

  it('transports identical classifications once and hydrates them losslessly', () => {
    const original = make('hr-only', '2024-05-01', { device_watts: false, metrics: {} });
    const [payload] = dashboardRides([original]);
    expect(payload).not.toHaveProperty('clsH');
    const [roundtrip] = browser([original]);
    expect(roundtrip.clsH).toEqual(roundtrip.clsP);
    expect(classificationText(roundtrip, roundtrip.clsH)).toEqual(classificationText(original, original.clsH));
    expect(dashboardRides([make('both', '2024-05-01')])[0]).toHaveProperty('clsH');
  });

  it('keeps place names for search without coordinates or other geo metadata', () => {
    const ride = make('geo', '2024-05-01', { geo: { places: [{ name: 'Reno', lat: 39.5, lon: -119.8 }] } });
    expect(browser([ride])[0].geo).toEqual({ places: [{ name: 'Reno' }] });
  });

  it('keeps week/month boundaries, goal history and projection', () => {
    const rides = browser([make('april', '2024-04-30'), make('may', '2024-05-01'), make('next', '2024-06-01')]);
    for (const [period, value] of [['month', 1], ['week', 2]]) {
      const result = evalGoal({ metric: 'count', period, target: 10 }, rides, new Date('2024-05-03T12:00:00'));
      expect(result.value).toBe(value);
      expect(result.projection).toBeCloseTo(value / result.frac);
      expect(result.expected).toBeCloseTo(10 * result.frac);
      expect(result.hist).toHaveLength(period === 'week' ? 12 : 6);
    }
  });
});
