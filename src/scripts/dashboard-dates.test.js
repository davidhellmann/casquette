import { expect, it } from 'vitest';
import { processRide } from '../ride/index.js';
import { athleteTimeline } from '../training/index.js';
import { dashboardRides, hydrateRides } from './dashboard-data.js';
import { dashboardPeriod, RANGES } from '../dashboard-period/index.js';
import { evalGoal } from './goals.js';
import { computeMetrics } from '../../scripts/lib/metrics.mjs';
import { frontmatter } from '../../scripts/lib/store.mjs';
import { calendarDay } from '../training/index.js';

it.each([
  ['2024-06-02', '2024-06-03'], // Sunday → Monday
  ['2024-05-31', '2024-06-01'], // new month
  ['2023-12-31', '2024-01-01'], // new year
  ['2024-02-28', '2024-02-29'], // leap day
])('shows a finished ride on its local tomorrow in every calendar card: %s → %s', (actualDay, localDay) => {
  const now = new Date(actualDay + 'T11:45:00Z');
  const timeline = athleteTimeline({ history: [{ date: actualDay, ftp: 300, weight: 100 }, { date: localDay, ftp: 200, weight: 80 }] });
  const a = { id: 'done', name: 'Calendar ride', sport_type: 'Ride', start_date: actualDay + 'T10:30:00Z',
    start_date_local: localDay + 'T00:30:00+14:00', moving_time: 1800, distance: 10000, total_elevation_gain: 100,
    device_watts: true, average_watts: 200, average_heartrate: 150, gear_id: 'bike' };
  const athleteState = timeline.at(a.start_date_local);
  const data = Array.from({ length: 1801 }, (_, i) => i);
  const metrics = computeMetrics(a, { time: { data }, watts: { data: data.map(() => 200) }, heartrate: { data: data.map(() => 150) } }, athleteState.zones);
  const ride = processRide(frontmatter({ id: a.id, summary: a, metrics }, athleteState.zones), athleteState);
  // Future instant has a plausible local day; must not leak into ANY consumer, including goals.
  const future = processRide({ ...a, id: 'future', start_date: new Date(+now + 1).toISOString(), metrics }, athleteState);
  const ebike = processRide({ ...a, id: 'ebike', sport_type: 'EBikeRide', start_date_local: '2025-01-01T00:00:00', metrics }, athleteState);
  const all = hydrateRides(JSON.parse(JSON.stringify(dashboardRides([ride, future, ebike]))));
  for (const days of RANGES) for (const basis of ['power', 'hr']) {
    const d = dashboardPeriod(all, { days, basis, now, athleteState, gear: [{ id: 'bike', type: 'bike' }] });
    expect(d.rides.map(r => r.id)).toEqual(['done']);
    expect(d.S).toMatchObject({ n: 1, dist: 10000, tss: 50, time: 1800, avgWkg: 2.5 });
    expect(d.fitness.at(-1)).toMatchObject({ day: localDay, load: 50 });
    expect(d.S.ctl).toBeCloseTo(50 / 42);
    expect(d.S.atl).toBeCloseTo(50 / 7);
    expect(d.pmc.at(-1).day).toBe(localDay);
    expect(d.load).toMatchObject({ last7: 50, streak: 1, rest14: 0 });
    expect(d.history).toMatchObject({ cy: Number(localDay.slice(0, 4)), ytdNow: 10, km: 10 });
    const ordinal = (Date.parse(localDay) - Date.parse(localDay.slice(0, 4) + '-01-01')) / 86400000;
    expect(d.history.cumulative[0].data[ordinal]).toBe(10);
    expect(d.history.cumulative[0].data[ordinal + 1]).toBeNull();
    const cells = d.heatmap.cells.filter(c => c.rideDay);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ future: false, rideDay: { n: 1, load: 50 } });
    expect(calendarDay(cells[0].d)).toBe(localDay);
    expect(d.heatmap).toMatchObject({ activeDays: 1, longest: 1, current: 1, weeks: 1 });
    expect(d.weekly.buckets.reduce((s, b) => s + b.total, 0)).toBe(.5);
    expect(d.sparks.tss.reduce((s, v) => s + v, 0)).toBe(50);
    expect(d.rhythm.total).toBe(.5);
    expect(d.records.np.id).toBe('done');
    expect(d.S.curve[1200]).toMatchObject({ w: 200, id: 'done' });
    expect(d.curves.wkg.curve[1200]).toBe(2.5);
    expect(d.tiz.power.total).toBe(1800);
    expect(d.garage.total).toBe(10000);
    expect(d.nutrition.fluid).toBe(.325);
    expect(d.days).toBe(days || 1);
  }
  for (const period of ['week', 'month', 'year']) for (const [metric, value, extra] of [
    ['distance', 10, {}], ['time', .5, {}], ['count', 1, {}], ['tss', 50, {}],
    ['zone_time', .5, { zone: 4, basis: 'power' }], ['long_rides', 1, { min_km: 5 }],
  ]) {
    const result = evalGoal({ period, metric, target: 100, ...extra }, all, now);
    expect(result.value).toBe(value);
    expect(new Date(localDay + 'T00:30:00') >= result.P.start).toBe(true);
    expect(new Date(localDay + 'T00:30:00') < result.P.end).toBe(true);
    expect(result.hist.every(h => h.v === 0)).toBe(true);
  }
});

it('goals respect the local new year/new week, not future actual starts', () => {
  const now = new Date('2023-12-31T11:45:00Z');
  const athleteState = athleteTimeline().at('2024-01-01');
  const base = { start_date_local: '2024-01-01T00:30:00+14:00', distance: 10000, moving_time: 1800 };
  const all = hydrateRides(JSON.parse(JSON.stringify(dashboardRides([
    processRide({ ...base, id: 'done', start_date: '2023-12-31T10:30:00Z' }, athleteState),
    processRide({ ...base, id: 'future', start_date: '2023-12-31T11:45:00.001Z' }, athleteState),
  ]))));
  for (const period of ['week', 'month', 'year']) {
    expect(evalGoal({ period, metric: 'distance', target: 10 }, all, now)).toMatchObject({ value: 10, done: true });
  }
});

it.each([
  ['2024-06-02T10:00:00Z', '2024-06-02T19:00:00+09:00', '2024-06-02T11:00:00Z', 2, 19],
  ['2024-06-01T10:30:00Z', '2024-06-02T00:30:00+14:00', '2024-06-01T11:00:00Z', 2, 0],
  ['2024-06-02T10:30:00Z', '2024-06-01T23:30:00-11:00', '2024-06-02T11:00:00Z', 1, 23],
  ['2024-06-02T23:30:00Z', '2024-06-03T13:30:00+14:00', '2024-06-02T23:45:00Z', 3, 13],
])('transports the actual start %s losslessly, the calendar stays local', (start, local, clock, day, hour) => {
  const a = { id: 'past', start_date: start, start_date_local: local, moving_time: 3600, distance: 10000,
    device_watts: true, average_watts: 300, metrics: { np: 300 } };
  const athleteState = athleteTimeline({ history: [{ date: '2024-06-01', ftp: 200, weight: 100 }, { date: '2024-06-02', ftp: 300, weight: 60 }] }).at(local);
  const ride = processRide(a, athleteState);
  const future = processRide({ ...a, id: 'future', start_date: new Date(+new Date(clock) + 1).toISOString(), start_date_local: '2024-06-01T00:01:00-12:00' }, athleteState);
  const transported = hydrateRides(JSON.parse(JSON.stringify(dashboardRides([ride, future]))));
  for (const all of [[ride, future], transported]) {
    const d = dashboardPeriod(all, { days: 14, basis: 'power', now: new Date(clock) });
    expect(d.log.map(r => r.id)).toEqual(['past']);
    expect(d.S.n).toBe(1);
    expect(d.history.km).toBe(10);
    expect(d.log[0].d.getDate()).toBe(day);
    expect(d.log[0].d.getHours()).toBe(hour);
    expect(d.log[0]).toMatchObject({ ftp: day >= 2 ? 300 : 200, avg_wkg: day >= 2 ? 5 : 3, tss: day >= 2 ? 100 : 225 });
  }
  expect(transported.find(r => r.id === 'past').start).toBe(+new Date(start));
  // Inclusive actual-start boundary, retaining millisecond accuracy after JSON.
  const atStart = dashboardPeriod(transported, { days: 14, basis: 'power', now: new Date(start) });
  expect(atStart.log.map(r => r.id)).toEqual(['past']);
});
