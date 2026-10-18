import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestCurve } from '../training/index.js';
import { decodeDashboard, encodeDashboard } from './dashboard-payload.js';

const wire = (rides) => JSON.parse(encodeDashboard({ rides })).rides;

const fixtures = vi.hoisted(() => ({ athlete: {}, history: [], rides: [], zones: null }));
vi.mock('node:fs', () => ({ default: {
  existsSync: vi.fn((file) => file.endsWith('/zones.json') && fixtures.zones != null),
  readFileSync: vi.fn((file) => {
    if (file.endsWith('/athlete.json')) return JSON.stringify(fixtures.athlete);
    if (file.endsWith('/fitness-history.json')) return JSON.stringify(fixtures.history);
    if (file.endsWith('/zones.json') && fixtures.zones != null) return JSON.stringify(fixtures.zones);
    throw new Error(`Unexpected I/O: ${file}`);
  }),
} }));
// Real synced data (not the demo dataset) – see data-source.js.
vi.mock('./data-source.js', () => ({ selectDataSource: () => ({ demo: false, ridesDir: 'src/content/rides', gearDir: 'src/content/gear', streamsDir: 'public/streams', dataDir: 'src/data' }) }));
vi.mock('astro:content', () => ({ getCollection: vi.fn(async (name) => name === 'rides' ? fixtures.rides : []) }));

const ride = (id, date, watts, best) => ({ data: {
  id, start_date_local: `${date}T12:00:00Z`, sport_type: 'Ride', device_watts: true,
  average_watts: watts, moving_time: 3600, gear_id: 'bike',
  metrics: { np: watts, power_curve: best },
  segment_efforts: [{ id: `effort-${id}`, segment_id: 42, name: 'Synthetic climb', elapsed_time: 600, average_watts: watts }],
} });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fixtures.athlete = { profile: { weight: 60 }, zones: { ftp: 300 }, gear: [{ id: 'bike' }] };
  fixtures.history = [{ date: '2020-01-01', ftp: 200, weight: 100 }, { date: '2024-01-01', ftp: 300, weight: 60 }];
  fixtures.rides = [ride('old', '2021-06-01', 200, { 60: 400, 1200: 250 }), ride('new', '2024-06-01', 180, { 60: 300, 1200: 300 })];
  fixtures.zones = null;
});

describe('Athlete state – central build integration with synthetic data', () => {
  it('hands the athlete state to the dashboard payload and the year page as athleteState', async () => {
    const { athleteToday, loadAthlete, loadRides } = await import('./data.js');
    const source = decodeDashboard(encodeDashboard({ rides: await loadRides(), athlete: loadAthlete(), athleteState: athleteToday() }));
    expect(source.athlete.athleteState).toMatchObject({ ftp: 300, weight: 60, zones: { ftp: 300 } });
    const year = await (await import('./years.js')).yearData(2021);
    expect(year.athleteState).toMatchObject({ ftp: 200, weight: 100, zones: { ftp: 200 } });
  });

  it('delivers final ride values to build consumers and preserves the dashboard projection', async () => {
    fixtures.rides[0].data.average_heartrate = 100;
    fixtures.rides[0].data.metrics.efficiency_factor = 99;
    fixtures.rides[0].data.metrics.ftp_used = 300;
    fixtures.rides[0].data.metrics.time_in_power_zones = [60, 120];
    const { normalize, loadGear } = await import('./data.js');
    const old = normalize(fixtures.rides[0].data);
    expect(old).toMatchObject({ ef: 2, if_: 1, tss: 100, load: 100,
      clsP: { zone: 4, source: 'power' }, tizBasis: { power: { ftp: 300, zones: null } } });
    expect((await loadGear())[0].rides.find((r) => r.id === 'old')).toEqual(old);
    const year = await (await import('./years.js')).yearData(2021);
    expect(year.rides[0]).toEqual(old);
    expect(year.highlights.hardest).toEqual(old);
    expect(decodeDashboard(encodeDashboard({ rides: [old] })).rides[0]).toMatchObject({ ftp: 200, kg: 100, w: 200, np: 200,
      hr: 100, hr_max: null, cad: null, best: { 60: 400, 1200: 250 }, tss: 100,
      if_: 1, ef: 2, clsP: { zone: 4, source: 'power' }, clsH: { source: 'hr' },
      tizBasis: { power: { ftp: 300, zones: null } },
      tizP: [60, 120], tizH: null, dec: null });
  });

  it('loads athlete and history exactly once and gives the old ride its FTP/weight', async () => {
    const { normalize, athleteAt, athleteToday, loadHistory, loadAthlete } = await import('./data.js');
    expect(normalize(fixtures.rides[0].data)).toMatchObject({ ftp: 200, kg: 100, tss: 100 });
    athleteAt('2021-06-01'); athleteToday(); loadHistory(); loadAthlete();
    const fs = (await import('node:fs')).default;
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('changes the old ride\'s W/kg after an extra history entry, not its watts', async () => {
    let data = await import('./data.js');
    const before = data.normalize(fixtures.rides[0].data);
    fixtures.history.push({ date: '2021-01-01', weight: 80 });
    vi.resetModules();
    data = await import('./data.js');
    const after = data.normalize(fixtures.rides[0].data);
    expect(before.w / before.kg).toBe(2);
    expect(after.w / after.kg).toBe(2.5);
    expect(after.w).toBe(before.w);
    expect(after.ftp).toBe(before.ftp);
  });

  it('uses the body weight of each best\'s source ride, comparison curves included', async () => {
    const { curveWkg, loadRides, loadGear } = await import('./data.js');
    const rides = await loadRides();
    expect(await curveWkg(bestCurve(rides))).toEqual({ 60: 4, 1200: 5 });
    expect(await curveWkg(bestCurve((await loadGear())[0].rides))).toEqual({ 60: 4, 1200: 5 });
    const { yearData } = await import('./years.js');
    const year = await yearData(2021);
    expect(await curveWkg(year.curve)).toEqual({ 60: 4, 1200: 2.5 });
    expect(await curveWkg(year.curveAll)).toEqual({ 60: 4, 1200: 5 });
  });

  it('keeps the stat ride filters from #3 for historical bests, bikes, years and segments', async () => {
    const ebike = ride('ebike', '2021-06-02', 900, { 60: 1000 });
    ebike.data.sport_type = 'EBikeRide';
    fixtures.rides.push(ebike);
    const { loadRides, loadStatRides, loadGear, curveWkg } = await import('./data.js');
    expect(await loadRides()).toHaveLength(3); // The ride page stays available.
    expect(await loadStatRides()).toHaveLength(2);
    expect(await curveWkg(bestCurve(await loadStatRides()))).toEqual({ 60: 4, 1200: 5 });
    expect((await loadGear())[0].rides).toHaveLength(2);
    const year = await (await import('./years.js')).yearData(2021);
    expect(year.rides).toHaveLength(1);
    const [segment] = await (await import('./segments.js')).loadSegments();
    expect(segment).toMatchObject({ bestW: 200, bestWkg: 2, n: 2 });
    const performance = await (await import('./performance.js')).performanceData();
    expect(performance.allTime[60]).toMatchObject({ w: 400, id: 'old' });
  });

  it('does not invent today\'s body weight for unknown best origins', async () => {
    const { curveWkg } = await import('./data.js');
    expect(await curveWkg({ 60: { w: 400, id: 'missing' } })).toEqual({ 60: null });
  });

  it('passes the historical athlete state of each ride to the dashboard', async () => {
    const { normalize } = await import('./data.js');
    expect(wire([normalize(fixtures.rides[0].data)])[0]).toMatchObject({ ftp: 200, kg: 100 });
  });

  it('uses the effort\'s body weight for the segment best, not the latest ride\'s', async () => {
    const { loadSegments } = await import('./segments.js');
    const [segment] = await loadSegments();
    expect(segment).toMatchObject({ bestW: 200, bestWkg: 2 });
    expect(segment.efforts.map((e) => e.w / e.kg)).toEqual([2, 3]);
  });

  it('uses the underlying effort\'s body weight for historical eFTP bests', async () => {
    fixtures.history.push({ date: '2021-06-15', weight: 80 });
    const p = await (await import('./performance.js')).performanceData();
    const june = p.months.find((m) => m.key === '2021-06');
    expect(june).toMatchObject({ eftp: 238, weight: 80, wkg: 2.38 }); // 250 W × 0.95 at 100 kg back then.
  });

  it('also computes the yearly performance profile with the body weight of each best', async () => {
    const { performanceData } = await import('./performance.js');
    const p = await performanceData();
    expect(p.profile.find((y) => y.year === 2021).vals[1]).toMatchObject({ w: 400, wkg: 4, id: 'old' });
    // Body weight can change within a year: no blanket mid-year value.
    fixtures.history.push({ date: '2021-06-15', weight: 80 });
    vi.resetModules();
    const changed = await (await import('./performance.js')).performanceData();
    expect(changed.profile.find((y) => y.year === 2021).vals[1].wkg).toBe(4);
  });

  it('applies the zones file to every ride: dated HR zones on its HR distribution, custom power bounds', async () => {
    fixtures.zones = { heart_rate: [{ bpm: [0, 120, 140, 160, 180] }, { from: '2024-01-01', bpm: [0, 130, 150, 170, 190] }], power: { ftp_percent: [0, 50, 70, 90, 110, 130, 150] } };
    const hr_distribution = { version: 1, method: 'right-sample-dt-0-10s', samples: [[125, 60], [155, 30]] };
    for (const r of fixtures.rides) r.data.metrics.hr_distribution = hr_distribution;
    const { loadRides, athleteToday } = await import('./data.js');
    const [recent, old] = await loadRides();
    expect(old.tizH).toEqual([0, 60, 30, 0, 0]);
    expect(recent.tizH).toEqual([60, 0, 30, 0, 0]);
    expect(old.tizBasis.hr).toMatchObject({ source: 'distribution', zones: [{ min: 0, max: 119 }, { min: 120, max: 139 }, { min: 140, max: 159 }, { min: 160, max: 179 }, { min: 180, max: null }] });
    expect(old.zones.power_zones[1]).toEqual({ min: 101, max: 140 }); // FTP 200 W on the ride date
    expect(athleteToday().zones.source).toEqual({ hr: 'file', power: 'file' });
  });

  it('without a zones file the zones stay the athlete\'s HR zones (here the defaults) and Coggan', async () => {
    const { athleteToday } = await import('./data.js');
    expect(athleteToday().zones.source).toEqual({ hr: 'default', power: 'default' });
  });
});

