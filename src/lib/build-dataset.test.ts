import { describe, expect, it } from 'vitest';
import { createBuildDataset, memorySource } from './build-dataset.ts';
import { decodeDashboard, encodeDashboard } from './dashboard-payload.ts';
import { dashboardPeriod } from '../dashboard-period/index.ts';
import { calendarDay } from '../training/index.ts';
import { yearList, yearData } from './years.ts';
import { yearsIndexPayload } from './year-payload.ts';
import { gearIndexPayload } from './gear-payload.ts';
import { segmentsIndexPayload } from './segment-payload.ts';
import { performancePayload } from './performance-payload.ts';
import { ridePayload } from './ride-payload.ts';
import { mapPayload } from './map-payload.ts';

const pad = (n) => String(n).padStart(2, '0');
/** Written local start time of a host-local Date ('YYYY-MM-DDTHH:MM:SS'). */
const local = (d) => `${calendarDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
/** A ride whose actual start is `start` and whose written local start time is `written` (default: the same wall time). */
const ride = (id, start, { written = local(start), ...extra } = {}) => ({
  id, name: `Ride ${id}`, sport_type: 'Ride', start_date: start.toISOString(), start_date_local: written,
  distance: 20000, moving_time: 3600, gear_id: 'b1', device_watts: true, average_watts: 200,
  metrics: { np: 200, power_curve: { 60: 300 } },
  summary_polyline: '_p~iF~ps|U_ulLnnqC',
  segment_efforts: [{ segment_id: 7, name: 'Hill', elapsed_time: 300, average_watts: 250 }],
  ...extra,
});

const NOW = new Date(2024, 5, 2, 12); // 2 June 2024, 12:00 build time
const hours = (h) => new Date(+NOW + h * 3600000);
const build = (source, now = NOW) => createBuildDataset(memorySource(source), { now });

describe('build calendar – actual start decides, calendar end bounds the calendar views', () => {
  const rides = [
    ride('past', new Date(2024, 4, 20, 9)),
    ride('earlier-today', hours(-3)),
    // Later today: has not happened yet at build time, with the strongest power best of all
    ride('later-today', hours(5), { metrics: { np: 400, power_curve: { 60: 900 } } }),
  ];

  it('admits only rides whose actual start is not in the future; today is the start of the build day', async () => {
    const data = await build({ rides, gear: [{ id: 'b1', name: 'Road bike' }] });
    expect(data.calendar.now).toEqual(NOW);
    expect(data.calendar.today).toEqual(new Date(2024, 5, 2));
    expect(data.calendar.rides.map((r) => r.id)).toEqual(['earlier-today', 'past']);
    expect(data.calendar.statRides.map((r) => r.id)).toEqual(['earlier-today', 'past']);
    expect(data.calendar.end).toEqual(new Date(2024, 5, 2));
  });

  it('leaves a future ride out of every build view that counts rides, but gives it its page, route and payload entry', async () => {
    const data = await build({ rides, gear: [{ id: 'b1', name: 'Road bike' }] });
    // Every ride: ride page, map, dashboard payload (the browser admits rides by its own clock)
    expect(data.rides.map((r) => r.id)).toEqual(['later-today', 'earlier-today', 'past']);
    expect(ridePayload(data, { id: 'later-today' }).name).toBe('Ride later-today');
    expect(JSON.parse(mapPayload(data).json).routes.map((r) => r.i)).toEqual(['later-today', 'earlier-today', 'past']);
    expect(decodeDashboard(encodeDashboard({ rides: data.rides })).rides).toHaveLength(3);
    // Counted nowhere at build time
    expect(data.gear[0]).toMatchObject({ t: { n: 2 }, kmTotal: 40 });
    expect(gearIndexPayload(data).bikes[0]).toMatchObject({ rides: 2, km: 40 });
    expect(yearData(data, 2024).t.n).toBe(2);
    expect(yearsIndexPayload(data).rides).toBe(2);
    expect(segmentsIndexPayload(data).attempts).toBe(2);
    expect(performancePayload(data)).toMatchObject({ rides: 2, curves: { all: { 60: 300 } } });
    // The bests of the ride page compare with admitted stat rides only
    expect(ridePayload(data, { id: 'earlier-today' }).curve.allTime).toEqual({ 60: 300 });
  });

  it('moves the calendar end to the latest ride date of an admitted stat ride east of the build machine', async () => {
    // Started an hour ago, but its written local time (a time zone further east) is already tomorrow
    const east = ride('east', hours(-1), { written: '2024-06-03T06:00:00' });
    const eBike = ride('e-bike', hours(-1), { written: '2024-06-04T06:00:00', sport_type: 'EBikeRide' });
    const future = ride('future', hours(2), { written: '2024-06-05T06:00:00' });
    expect((await build({ rides: [future, eBike] })).calendar.end).toEqual(new Date(2024, 5, 2));
    const data = await build({ rides: [east, eBike, future] });
    expect(data.calendar.end).toEqual(new Date(2024, 5, 3));
    expect(data.calendar.rides.map((r) => r.id)).toEqual(['e-bike', 'east']);
    // The year calendar runs to the calendar end, so the east ride's day is drawn
    const days = yearData(data, 2024).calendar.days;
    expect(days['2024-06-03']?.n).toBe(1);
  });

  it('takes the running year from the calendar end', async () => {
    const data = await build({ rides: [ride('nye', new Date(2023, 11, 31, 9)), ride('ny', hours(-1), { written: '2025-01-01T06:00:00' })] }, new Date(2024, 11, 31, 20));
    expect(data.calendar.end).toEqual(new Date(2025, 0, 1));
    expect(yearList(data)).toEqual([2025, 2023]);
    expect(yearData(data, 2025).isCurrent).toBe(true);
    expect(yearsIndexPayload(data).years.map((y) => [y.year, y.current])).toEqual([[2025, true], [2023, false]]);
  });
});

describe('build dataset – data source, demo clock and gear', () => {
  it('moves demo dates forward in whole weeks, caps the sync time at now and serves demo streams', async () => {
    const data = await build({
      demo: true, meta: { newest_day: '2024-05-20' },
      athlete: { synced_at: '2024-05-30T10:00:00.000Z', profile: { first_name: 'Jane', weight: 70 } },
      history: [{ date: '2024-05-01', ftp: 250 }],
      rides: [{ id: 'd1', start_date: '2024-05-20T08:00:00Z', start_date_local: '2024-05-20T10:00:00' }],
      streams: { d1: { time: [0, 1] } },
    });
    expect(data.demo).toBe(true);
    expect(data.rides[0]).toMatchObject({ start_local: '2024-05-27T10:00:00', start: Date.parse('2024-05-27T08:00:00Z') });
    expect(data.athlete.synced_at).toBe(NOW.toISOString());
    expect(data.athlete.profile).toEqual({ first_name: 'Jane', last_name: '' });
    expect(calendarDay(data.history[0].d)).toBe('2024-05-08');
    expect(data.streamIds()).toEqual(['d1']);
    expect(data.streams('d1')).toEqual({ time: [0, 1] });
    // The raw entry keeps the frontmatter as written (ride page: Markdown body, all data)
    expect(data.entry('rides', 'd1').data.start_date_local).toBe('2024-05-20T10:00:00');
    expect(data.entry('rides', 'missing')).toBeNull();
  });

  it('never shifts real data and serves no streams paths for it (public/streams serves them)', async () => {
    const data = await build({ meta: { newest_day: '2024-05-20' }, rides: [{ id: 'r1', start_date_local: '2024-05-20T10:00:00' }], streams: { r1: {} } });
    expect(data.rides[0].start_local).toBe('2024-05-20T10:00:00');
    expect(data.streamIds()).toEqual([]);
  });

  it('bike pages and the dashboard garage use stat ride km for total, cost and ranking', async () => {
    const gear = [
      { id: 'b1', type: 'bike', distance: 110000, custom: { price_eur: 1000 } },
      { id: 'b2', type: 'bike', distance: 20000 },
      { id: 'b3', type: 'bike', distance: 999999, retired: true },
    ];
    const rides = [['human', 'Ride', 'b1', 10000], ['electric', 'EBikeRide', 'b1', 100000], ['human2', 'Ride', 'b2', 20000], ['emtb', 'EMountainBikeRide', 'b3', 999999]]
      .map(([id, sport_type, gear_id, distance]) => ({ id, sport_type, gear_id, distance, start_date_local: '2024-06-01T12:00:00', start_date: '2024-06-01T10:00:00Z' }));
    const data = await build({ athlete: { gear }, gear, rides });
    expect(data.gear.map((g) => g.id)).toEqual(['b2', 'b1', 'b3']);
    expect(data.gear.find((g) => g.id === 'b1')).toMatchObject({ kmTotal: 10, costPerKm: 100, t: { km: 10, n: 1 } });
    expect(data.gear.find((g) => g.id === 'b3')).toMatchObject({ kmTotal: 0, costPerKm: null });
    const source = decodeDashboard(encodeDashboard({ rides: data.rides, athlete: data.athlete }));
    const d = dashboardPeriod(source.rides, { days: 30, basis: 'power', now: new Date('2024-06-02T12:00:00Z'), gear: source.athlete.gear });
    expect(d.garage.total).toBe(30000);
    expect(d.garage.max).toBe(20000);
    expect(d.garage.active.map((g) => [g.id, g.statsDistance])).toEqual([['b2', 20000], ['b1', 10000]]);
    expect(d.garage.retired[0].statsDistance).toBe(0);
    expect(d.log).toHaveLength(4);
    expect(d.S.n).toBe(2);
  });

  it('adds gear known only from the athlete and keeps the gear entries for the bike page body', async () => {
    const data = await build({ athlete: { gear: [{ id: 'g9', name: 'Shoes', type: 'shoe', distance: 5000 }] }, gear: [{ id: 'b1', name: 'Road bike' }] });
    expect(data.gear.map((g) => [g.id, g.type, g.stravaKm])).toEqual([['b1', 'bike', 0], ['g9', 'shoe', 5]]);
    expect(data.entry('gear', 'b1').data.name).toBe('Road bike');
    expect(data.entry('gear', 'g9')).toBeNull();
  });
});
