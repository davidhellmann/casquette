import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRideStorage } from './ride-storage.mjs';
import { createAthleteStorage } from './athlete-storage.mjs';
import { rebuild } from './rebuild.mjs';
import { runSync } from './sync.mjs';
import { createStravaFake } from './strava-fake.mjs';
import { rideFrontmatter } from './ride-file.mjs';
import { computeMetrics } from './metrics.mjs';
import { processRide } from '../../src/ride/index.js';
import { athleteTimeline } from '../../src/training/index.js';
import { calendarDay } from '../../src/training/index.js';

let root;
const put = (name, value) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
};
const text = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const json = (name) => JSON.parse(text(name));
const ridePath = (date = '2024-05-01', id = '7') => `src/content/rides/${date.slice(0, 4)}/${date}_${id}.md`;
const summary = (id = '7', gear_id = 'b7') => ({ id, name: 'Test ride', sport_type: 'Ride', type: 'Ride', start_date: '2024-05-01T12:00:00Z', start_date_local: '2024-05-01T12:00:00', gear_id, moving_time: 120, device_watts: true, average_watts: 201 });
const rec = () => ({ id: '7', summary: summary(), detail: { description: 'Description from Strava' }, _sync: { summary: 1000 } });
const streams = { time: { data: [0, 1, 2] }, watts: { data: [100, 201.25, 300] }, heartrate: { data: [110, 140, 170] } };
const athlete = { profile: { weight: 80 }, zones: { ftp: 240, heart_rate_zones: [{ min: 0, max: 149 }, { min: 150, max: null }] }, gear: [{ id: 'b7', name: 'Athlete bike', type: 'bike' }, { id: 'b8', name: 'Athlete only', type: 'bike' }] };
const open = () => createRideStorage({ root, gear: createAthleteStorage({ root }).gear().byId });

beforeEach(() => {
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden in fixture tests'); });
  fs.mkdirSync('logs', { recursive: true });
  root = fs.mkdtempSync(path.resolve('logs/t09-fixture-'));
  put('src/data/athlete.json', athlete);
  put('.strava-cache/gear.json', { b7: { id: 'b7', name: 'Cache bike', type: 'bike', _at: Date.now() }, b9: { id: 'b9', name: 'Cache only', type: 'bike', _at: Date.now() } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }); });

function fakeSync({ failDetail = false, failGear = false, noDetail = false, noStreams = false, activities } = {}) {
  const strava = createStravaFake((url) => {
    if (url === '/athlete') return { id: 1, weight: 80, ftp: 240, bikes: [{ id: 'b10', name: 'New bike' }] };
    if (url === '/athlete/zones') return { heart_rate: { zones: athlete.zones.heart_rate_zones } };
    if (url === '/athletes/1/stats') return {};
    if (url === '/athlete/activities') return activities || [summary(), summary('8', 'b8'), summary('9', 'b9'), summary('10', 'b10')];
    if (url.startsWith('/gear/')) {
      if (failGear) throw new Error('gear fault');
      return { id: url.split('/').pop(), name: 'API bike' };
    }
    if (url.endsWith('/streams')) return streams;
    if (url.startsWith('/activities/')) {
      if (failDetail) throw new Error('detail fault');
      return { description: 'API description' };
    }
    throw new Error(`Unexpected API call: ${url}`);
  });
  const geocodeRides = vi.fn(async (recs, { onRide }) => {
    for (const r of recs) { r.geo = { countries: ['Austria'] }; onRide(r); }
  });
  return { strava, geocodeRides, run: () => runSync({ root, strava, geocodeRides, options: { noDetail, noStreams } }) };
}

it('normal sync (list, details/streams, geo) and offline rebuild produce identical rides with complete bike names', async () => {
  put('src/content/gear/b7.md', '---\nid: "b7"\ncustom:\n  notes: "keep" # comment\n---\n\nBike history\n');
  const fake = fakeSync(); await fake.run();
  const store = open();
  const files = store.list().map((r) => [r.file, text(r.file)]);
  expect(files).toHaveLength(4);
  for (const [id, name] of [['7', 'Cache bike'], ['8', 'API bike'], ['9', 'Cache only'], ['10', 'API bike']]) {
    expect(text(ridePath('2024-05-01', id))).toContain(`gear_name: "${name}"`);
  }
  expect(text(ridePath())).toContain('API description');
  expect(text(ridePath())).toContain('Austria');
  expect(store.read('7').metrics.power_distribution.samples).toEqual([[201.25, 1], [300, 1]]);
  expect(store.read('7').metrics.hr_distribution.samples).toEqual([[140, 1], [170, 1]]);
  const gearBefore = text('src/content/gear/b7.md');
  expect(gearBefore).toContain('notes: "keep" # comment');
  expect(gearBefore).toContain('Bike history');
  const calls = fake.strava.calls.length;
  expect(rebuild({ root })).toBe(4);
  expect(fake.strava.calls).toHaveLength(calls);
  for (const [file, before] of files) expect(text(file)).toBe(before);
  expect(text('src/content/gear/b7.md')).toBe(gearBefore);
});

it('on gear API failures uses every known name from athlete, gear cache and current bike list, also offline', async () => {
  await fakeSync({ failGear: true, noDetail: true, noStreams: true }).run();
  for (const [id, name] of [['7', 'Cache bike'], ['8', 'Athlete only'], ['9', 'Cache only'], ['10', 'New bike']]) {
    const before = text(ridePath('2024-05-01', id));
    expect(before).toContain(`gear_name: "${name}"`);
    rebuild({ root });
    expect(text(ridePath('2024-05-01', id))).toBe(before);
  }
});

it('list/geo and rebuild keep the legacy basis and independent power distribution from the fixture cache', async () => {
  const r = rec();
  r.metrics = { source: 'summary', np: 220, time_in_power_zones: [10, 20], time_in_power_zones_basis: { source: 'legacy', ftp: 300, zones: null, exact: false }, power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[111.25, 2.5]] } };
  put('.strava-cache/activities/7.json', r);
  await fakeSync({ noStreams: true, noDetail: true }).run();
  const { np, ...independent } = r.metrics;
  const expected = { ...independent, metric_sources: { np: 'summary' } };
  expect(open().read('7').metrics).toEqual(expected);
  const before = text(ridePath());
  rebuild({ root });
  expect(text(ridePath())).toBe(before);
  expect(open().read('7').metrics).toEqual(expected);
});

it.each(['summary', 'streams'])('updates summary NP without losing independent %s data, also on rebuild', async (source) => {
  const r = rec();
  r.summary = { ...r.summary, moving_time: 3600, weighted_average_watts: 200 };
  r._sync = { summary: 1000, detail: 1000, streams: 1000 };
  const independent = { power_curve: { 60: 333 }, time_in_power_zones: [10, 20],
    time_in_power_zones_basis: { source: 'legacy', ftp: 260, zones: null, exact: false },
    time_in_hr_zones: [30, 40], power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[111.25, 2.5]] }, computed_at: '2020-01-01' };
  r.metrics = { source, np: 200, ...independent };
  put('.strava-cache/activities/7.json', r);
  const fake = fakeSync({ activities: [{ ...r.summary, weighted_average_watts: 300 }] });
  await fake.run();
  const check = () => {
    const saved = open().read('7');
    expect(saved.metrics).toMatchObject(independent);
    const np = source === 'summary' ? 300 : 200;
    expect(saved.metrics.np).toBe(np);
    expect(processRide(rideFrontmatter(saved), athleteTimeline({ athlete: { zones: { ftp: 200 } } }).at('2024-05-01')))
      .toMatchObject({ np, tss: source === 'summary' ? 225 : 100 });
    expect(text(ridePath())).toContain(`np: ${np}`);
  };
  check();
  expect(fake.strava.calls.some(([url]) => url.startsWith('/activities/'))).toBe(false);
  const before = text(ridePath());
  rebuild({ root }); check();
  expect(text(ridePath())).toBe(before);
  // Independently stale cache must also refresh on an offline rebuild.
  if (source === 'summary') {
    const saved = open().read('7'); saved.metrics.np = 123;
    put('.strava-cache/activities/7.json', saved);
    rebuild({ root }); check();
  }
});

it.each(['hr-only', 'hr-unknown', 'short', 'interrupted', 'measured', 'zero'])('refreshes the NP fallback with genuine raw-data provenance (%s), save and offline rebuild', async (kind) => {
  const r = rec();
  r.summary = { ...r.summary, moving_time: 3600, weighted_average_watts: kind === 'hr-unknown' ? null : 200, average_watts: 200,
    average_heartrate: 150, has_heartrate: true, suffer_score: 99 };
  r._sync = { summary: 1000, detail: 1000, streams: 1000 };
  const n = kind === 'short' ? 30 : 3601, time = Array.from({ length: n }, (_, i) => i);
  const raw = { time: { data: time }, heartrate: { data: time.map(() => 150) } };
  if (!kind.startsWith('hr-')) raw.watts = { data: time.map(i => kind === 'zero' ? 0 : kind === 'interrupted' && i % 30 === 29 ? null : 200) };
  r.metrics = { ...computeMetrics(r.summary, raw), computed_at: '2020-01-01' };
  const genuine = kind === 'measured' || kind === 'zero';
  const expectedNP = fallback => genuine ? kind === 'zero' ? 0 : 200 : fallback;
  const { np, variability_index, efficiency_factor, metric_sources, ...independent } = r.metrics;
  open().save(r);
  const updated = { ...r.summary, weighted_average_watts: 300, average_watts: 150, average_heartrate: 100 };
  const fake = fakeSync({ activities: [updated] });
  await fake.run();
  const check = fallback => {
    const saved = open().read('7'), np = expectedNP(fallback);
    expect(saved.metrics).toMatchObject(independent);
    expect(saved.metrics.np ?? null).toBe(np);
    expect(saved.metrics.metric_sources.np).toBe(genuine ? 'streams' : 'summary');
    const fm = rideFrontmatter(saved);
    expect(fm.metrics).toEqual(saved.metrics);
    expect(processRide(fm, athleteTimeline({ athlete: { zones: { ftp: 200 } } }).at('2024-05-01')))
      .toMatchObject({ np, tss: np == null ? null : Math.round((np / 200) ** 2 * 100), load: np == null ? 99 : Math.round((np / 200) ** 2 * 100) });
    if (np == null) {
      expect(saved.metrics).not.toHaveProperty('variability_index');
      expect(saved.metrics).not.toHaveProperty('efficiency_factor');
      expect(text(ridePath())).not.toMatch(/^  np:/m);
    } else {
      expect(saved.metrics.variability_index).toBe(Math.round(np / 150 * 1000) / 1000);
      expect(saved.metrics.efficiency_factor).toBe(np / 100);
      expect(saved.metrics.metric_sources).toMatchObject({ variability_index: 'np+summary', efficiency_factor: 'np+summary' });
      expect(text(ridePath())).toContain(`np: ${np}`);
    }
    expect(text(ridePath())).toContain('metric_sources:');
  };
  check(300);
  expect(fake.strava.calls.some(([url]) => url.startsWith('/activities/'))).toBe(false);
  const before = text(ridePath());
  rebuild({ root }); check(300);
  expect(text(ridePath())).toBe(before);
  // Independently stale cache, changed / removed / reintroduced summary; no raw stream refetch.
  for (const fallback of [250, null, 0, 300]) {
    const saved = open().read('7');
    saved.summary.weighted_average_watts = fallback;
    put('.strava-cache/activities/7.json', saved);
    rebuild({ root }); check(fallback);
  }
  const saved = open().read('7'); saved.summary.device_watts = false;
  put('.strava-cache/activities/7.json', saved);
  rebuild({ root });
  expect(open().read('7').metrics.np ?? null).toBe(expectedNP(null));
  expect(open().read('7').metrics).not.toHaveProperty('variability_index');
});

it('normal sync resumes after a stream write failure without false completion flags', async () => {
  const rename = fs.renameSync;
  let failed = false;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (!failed && to === path.join(root, 'public/streams/7.json')) { failed = true; throw new Error('disk fault'); }
    return rename(from, to);
  });
  await fakeSync().run();
  expect(failed).toBe(true);
  expect(open().read('7')._sync.streams).toBeUndefined();
  expect(open().read('7')._sync.detail).toBeUndefined();
  expect(fs.existsSync(path.join(root, 'public/streams/7.json'))).toBe(false);
  await fakeSync().run();
  expect(open().read('7').streamsFile).toBe(true);
  expect(text(ridePath())).toContain('API description');
});

it('a list without details already gets all names; failed details leave no streams and can be resumed', async () => {
  await fakeSync({ noDetail: true, noStreams: true }).run();
  expect(text(ridePath('2024-05-01', '10'))).toContain('gear_name: "API bike"');
  await fakeSync({ failDetail: true }).run();
  expect(open().read('7')._sync.streams).toBeUndefined();
  expect(fs.existsSync(path.join(root, 'public/streams/7.json'))).toBe(false);
  await fakeSync().run();
  expect(open().read('7').streamsFile).toBe(true);
  expect(open().read('7')._sync.detail).toBeTypeOf('number');
});

describe('sync run steps', () => {
  const now = Date.parse('2024-06-01T10:00:00Z');
  const clock = { now: () => now, sleep: async () => {} };
  const run = (fake) => runSync({ root, strava: fake.strava, geocodeRides: fake.geocodeRides, clock, options: { noDetail: true, noStreams: true, noGeo: true } });

  it('stamps summaries, gear, the athlete file and a new athlete history entry with the injected clock', async () => {
    await run(fakeSync());
    expect(open().read('7')._sync.summary).toBe(now);
    expect(json('.strava-cache/gear.json').b8._at).toBe(now);
    expect(text('src/content/gear/b8.md')).toContain('synced_at: "2024-06-01T10:00:00.000Z"');
    expect(json('src/data/athlete.json')).toMatchObject({ synced_at: '2024-06-01T10:00:00.000Z', zones: { ftp: 240 }, sync: { list_complete: true, oldest: '2024-05-01T12:00:00.000Z' } });
    expect(json('src/data/fitness-history.json')).toEqual([{ id: calendarDay(new Date(now)), date: calendarDay(new Date(now)), ftp: 240, weight: 80, source: 'strava', note: 'Initial value from Strava' }]);
  });

  it('fetches only gear whose cached details are missing or older than 7 days', async () => {
    put('.strava-cache/gear.json', { b7: { id: 'b7', name: 'Fresh', type: 'bike', _at: now - 6 * 86400e3 }, b9: { id: 'b9', name: 'Stale', type: 'bike', _at: now - 8 * 86400e3 } });
    const fake = fakeSync();
    await run(fake);
    expect(fake.strava.calls.map(([url]) => url).filter((url) => url.startsWith('/gear/')).sort()).toEqual(['/gear/b10', '/gear/b8', '/gear/b9']);
  });

  it('loads the history once, then only asks for activities since three days before the newest one', async () => {
    const first = fakeSync();
    await run(first);
    expect(first.strava.calls.filter(([url]) => url === '/athlete/activities').map(([, params]) => params))
      .toEqual([{ before: now / 1000 + 86400, per_page: 200 }]);
    const second = fakeSync();
    await run(second);
    expect(second.strava.calls.filter(([url]) => url === '/athlete/activities').map(([, params]) => params))
      .toEqual([{ after: Date.parse('2024-05-01T12:00:00Z') / 1000 - 3 * 86400, per_page: 200, page: 1 }]);
  });

  it('keeps the history cursor when the daily limit stops the list, and resumes from it', async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({ ...summary(String(100 + i)), start_date: `2024-04-${String(1 + (i % 28)).padStart(2, '0')}T12:00:00Z` }));
    let pages = 0;
    const fake = fakeSync();
    fake.strava.respondWith((url) => {
      if (url === '/athlete/activities') { if (pages++) throw fake.strava.dailyLimit(); return page; }
      return url === '/athlete' ? { id: 1, weight: 80, ftp: 240 } : url.startsWith('/gear/') ? null : {};
    });
    await run(fake);
    expect(json('src/data/athlete.json').sync.list_complete).toBe(false);
    const resumed = fakeSync();
    await run(resumed);
    expect(resumed.strava.calls.find(([url, params]) => url === '/athlete/activities' && params.before)[1].before)
      .toBe(Date.parse('2024-04-01T12:00:00Z') / 1000);
  });
});

describe('places budget', () => {
  const budget = async (options) => {
    const fake = fakeSync();
    await runSync({ root, strava: fake.strava, geocodeRides: fake.geocodeRides, options: { noDetail: true, noStreams: true, ...options } });
    return fake.geocodeRides.mock.calls[0][1].budgetMs;
  };

  it('spends at most 15 minutes on a plain sync', async () => {
    expect(await budget({})).toBe(15 * 60e3);
  });
  it('resolves every place on a waiting sync (npm run sync:all)', async () => {
    expect(await budget({ wait: true })).toBe(0);
  });
  it('an explicit GEO_BUDGET_MIN wins in both cases', async () => {
    expect(await budget({ geoBudgetMin: '5' })).toBe(5 * 60e3);
    expect(await budget({ wait: true, geoBudgetMin: '5' })).toBe(5 * 60e3);
    expect(await budget({ wait: true, geoBudgetMin: '' })).toBe(0);
  });
});
