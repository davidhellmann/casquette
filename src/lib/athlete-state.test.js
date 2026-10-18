import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestCurve } from '../training/index.js';
import { decodeDashboard, encodeDashboard } from './dashboard-payload.js';
import { createBuildDataset, memorySource } from './build-dataset.js';
import { yearData } from './years.js';
import { segmentPayload } from './segment-payload.ts';
import { performancePayload } from './performance-payload.ts';

const NOW = new Date(2025, 0, 15, 12);
const wire = (rides) => JSON.parse(encodeDashboard({ rides })).rides;

const ride = (id, date, watts, best) => ({
  id, start_date_local: `${date}T12:00:00Z`, sport_type: 'Ride', device_watts: true,
  average_watts: watts, moving_time: 3600, gear_id: 'bike',
  metrics: { np: watts, power_curve: best },
  segment_efforts: [{ id: `effort-${id}`, segment_id: 42, name: 'Synthetic climb', elapsed_time: 600, average_watts: watts }],
});

// Real synced data (not the demo dataset): no demo date shift.
let fixtures;
beforeEach(() => {
  fixtures = {
    athlete: { profile: { weight: 60 }, zones: { ftp: 300 }, gear: [{ id: 'bike' }] },
    history: [{ date: '2020-01-01', ftp: 200, weight: 100 }, { date: '2024-01-01', ftp: 300, weight: 60 }],
    rides: [ride('old', '2021-06-01', 200, { 60: 400, 1200: 250 }), ride('new', '2024-06-01', 180, { 60: 300, 1200: 300 })],
    zonesFile: null,
  };
});
const dataset = (source = memorySource(fixtures)) => createBuildDataset(source, { now: NOW });
const byId = (data, id) => data.rides.find((r) => r.id === id);

describe('Athlete state – central build integration with synthetic data', () => {
  it('hands the athlete state to the dashboard payload and the year page as athleteState', async () => {
    const data = await dataset();
    const source = decodeDashboard(encodeDashboard({ rides: data.rides, athlete: data.athlete, athleteState: data.athleteToday }));
    expect(source.athlete.athleteState).toMatchObject({ ftp: 300, weight: 60, zones: { ftp: 300 } });
    expect(yearData(data, 2021).athleteState).toMatchObject({ ftp: 200, weight: 100, zones: { ftp: 200 } });
  });

  it('delivers final ride values to build consumers and preserves the dashboard projection', async () => {
    Object.assign(fixtures.rides[0], { average_heartrate: 100 });
    Object.assign(fixtures.rides[0].metrics, { efficiency_factor: 99, ftp_used: 300, time_in_power_zones: [60, 120] });
    const data = await dataset();
    const old = byId(data, 'old');
    expect(old).toMatchObject({ ef: 2, if_: 1, tss: 100, load: 100,
      clsP: { zone: 4, source: 'power' }, tizBasis: { power: { ftp: 300, zones: null } } });
    expect(data.gear[0].rides.find((r) => r.id === 'old')).toBe(old);
    const year = yearData(data, 2021);
    expect(year.rides[0]).toBe(old);
    expect(year.highlights.hardest).toBe(old);
    expect(decodeDashboard(encodeDashboard({ rides: [old] })).rides[0]).toMatchObject({ ftp: 200, kg: 100, w: 200, np: 200,
      hr: 100, hr_max: null, cad: null, best: { 60: 400, 1200: 250 }, tss: 100,
      if_: 1, ef: 2, clsP: { zone: 4, source: 'power' }, clsH: { source: 'hr' },
      tizBasis: { power: { ftp: 300, zones: null } },
      tizP: [60, 120], tizH: null, dec: null });
  });

  it('reads athlete and history exactly once and gives the old ride its FTP/weight', async () => {
    const source = memorySource(fixtures);
    const athlete = vi.spyOn(source, 'athlete'), history = vi.spyOn(source, 'history');
    const data = await dataset(source);
    expect(byId(data, 'old')).toMatchObject({ ftp: 200, kg: 100, tss: 100 });
    data.athleteAt('2021-06-01'); data.athleteAt(NOW);
    expect(athlete).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('changes the old ride\'s W/kg after an extra history entry, not its watts', async () => {
    const before = byId(await dataset(), 'old');
    fixtures.history.push({ date: '2021-01-01', weight: 80 });
    const after = byId(await dataset(), 'old');
    expect(before.w / before.kg).toBe(2);
    expect(after.w / after.kg).toBe(2.5);
    expect(after.w).toBe(before.w);
    expect(after.ftp).toBe(before.ftp);
  });

  it('uses the body weight of each best\'s source ride, comparison curves included', async () => {
    const data = await dataset();
    expect(data.curveWkg(bestCurve(data.rides))).toEqual({ 60: 4, 1200: 5 });
    expect(data.curveWkg(bestCurve(data.gear[0].rides))).toEqual({ 60: 4, 1200: 5 });
    const year = yearData(data, 2021);
    expect(data.curveWkg(year.curve)).toEqual({ 60: 4, 1200: 2.5 });
    expect(data.curveWkg(year.curveAll)).toEqual({ 60: 4, 1200: 5 });
  });

  it('keeps the stat ride filters for historical bests, bikes, years and segments', async () => {
    const ebike = ride('ebike', '2021-06-02', 900, { 60: 1000 });
    ebike.sport_type = 'EBikeRide';
    fixtures.rides.push(ebike);
    const data = await dataset();
    expect(data.rides).toHaveLength(3); // The ride page stays available.
    expect(data.calendar.statRides).toHaveLength(2);
    expect(data.curveWkg(bestCurve(data.calendar.statRides))).toEqual({ 60: 4, 1200: 5 });
    expect(data.gear[0].rides).toHaveLength(2);
    expect(yearData(data, 2021).rides).toHaveLength(1);
    expect(segmentPayload(data, { id: '42' })).toMatchObject({ bestW: 200, bestWkg: 2 });
    expect(segmentPayload(data, { id: '42' }).efforts).toHaveLength(2);
    const performance = performancePayload(data);
    expect(performance.curves.all[60]).toBe(400);
    expect(performance.profile.find((y) => y.year === 2021).vals[1]).toMatchObject({ w: 400, id: 'old' });
  });

  it('does not invent today\'s body weight for unknown best origins', async () => {
    expect((await dataset()).curveWkg({ 60: { w: 400, id: 'missing' } })).toEqual({ 60: null });
  });

  it('passes the historical athlete state of each ride to the dashboard', async () => {
    expect(wire([byId(await dataset(), 'old')])[0]).toMatchObject({ ftp: 200, kg: 100 });
  });

  it('uses the effort\'s body weight for the segment best, not the latest ride\'s', async () => {
    const segment = segmentPayload(await dataset(), { id: '42' });
    expect(segment).toMatchObject({ bestW: 200, bestWkg: 2 });
    expect(segment.efforts.map((e) => e.w / e.kg)).toEqual([2, 3]);
  });

  it('uses the underlying effort\'s body weight for historical eFTP bests', async () => {
    fixtures.history.push({ date: '2021-06-15', weight: 80 });
    const june = performancePayload(await dataset()).months.find((m) => m.key === '2021-06');
    expect(june).toMatchObject({ eftp: 238, weight: 80, wkg: 2.38 }); // 250 W × 0.95 at 100 kg back then.
  });

  it('also computes the yearly performance profile with the body weight of each best', async () => {
    const p = performancePayload(await dataset());
    expect(p.profile.find((y) => y.year === 2021).vals[1]).toMatchObject({ w: 400, wkg: 4, id: 'old' });
    // Body weight can change within a year: no blanket mid-year value.
    fixtures.history.push({ date: '2021-06-15', weight: 80 });
    const changed = performancePayload(await dataset());
    expect(changed.profile.find((y) => y.year === 2021).vals[1].wkg).toBe(4);
  });

  it('applies the zones file to every ride: dated HR zones on its HR distribution, custom power bounds', async () => {
    fixtures.zonesFile = { heart_rate: [{ bpm: [0, 120, 140, 160, 180] }, { from: '2024-01-01', bpm: [0, 130, 150, 170, 190] }], power: { ftp_percent: [0, 50, 70, 90, 110, 130, 150] } };
    const hr_distribution = { version: 1, method: 'right-sample-dt-0-10s', samples: [[125, 60], [155, 30]] };
    for (const r of fixtures.rides) r.metrics.hr_distribution = hr_distribution;
    const data = await dataset();
    const [recent, old] = data.rides;
    expect(old.tizH).toEqual([0, 60, 30, 0, 0]);
    expect(recent.tizH).toEqual([60, 0, 30, 0, 0]);
    expect(old.tizBasis.hr).toMatchObject({ source: 'distribution', zones: [{ min: 0, max: 119 }, { min: 120, max: 139 }, { min: 140, max: 159 }, { min: 160, max: 179 }, { min: 180, max: null }] });
    expect(old.zones.power_zones[1]).toEqual({ min: 101, max: 140 }); // FTP 200 W on the ride date
    expect(data.athleteToday.zones.source).toEqual({ hr: 'file', power: 'file' });
  });

  it('without a zones file the zones stay the athlete\'s HR zones (here the defaults) and Coggan', async () => {
    expect((await dataset()).athleteToday.zones.source).toEqual({ hr: 'default', power: 'default' });
  });
});
