import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRideStorage, loadRideStorageContext } from './ride-storage.mjs';
import { rebuild } from './rebuild.mjs';
import { runSync } from './sync.mjs';
import { frontmatter } from './store.mjs';
import { computeMetrics } from './metrics.mjs';
import { processRide } from '../../src/ride/index.js';
import { athleteTimeline } from '../../src/training/index.js';

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
const open = () => createRideStorage({ root, ...loadRideStorageContext({ root }) });

beforeEach(() => {
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden in fixture tests'); });
  fs.mkdirSync('logs', { recursive: true });
  root = fs.mkdtempSync(path.resolve('logs/t09-fixture-'));
  put('src/data/athlete.json', athlete);
  put('.strava-cache/gear.json', { b7: { id: 'b7', name: 'Cache bike', type: 'bike', _at: Date.now() }, b9: { id: 'b9', name: 'Cache only', type: 'bike', _at: Date.now() } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }); });

it('saves cache, Markdown and streams together, with a one-time context and unchanged power distributions', () => {
  const store = open();
  const r = rec();
  r.metrics = { source: 'streams', power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[201.25, 1], [300, 1]] }, time_in_power_zones: [10, 20], time_in_power_zones_basis: { source: 'legacy', ftp: 260, zones: null, exact: false } };
  store.save(r, { streams: { time: [0, 1], watts: [201.25, 300] }, streamsAt: 2000 });
  const saved = store.read('7');
  expect(saved.file).toBe(ridePath());
  expect(saved.streamsFile).toBe(true);
  expect(saved._sync.streams).toBe(2000);
  expect(saved.metrics).toEqual(r.metrics);
  expect(text(ridePath())).toContain('gear_name: "Cache bike"');
  expect(text(ridePath())).toContain('Description from Strava');
  expect(json('public/streams/7.json').watts).toEqual([201.25, 300]);
});

it('keeps the user body on a date change and adopts a new description after list → details', () => {
  const store = open();
  const r = rec(); delete r.detail;
  store.save(r);
  r.detail = { description: 'Description loaded later' };
  store.save(r);
  expect(text(ridePath())).toContain('Description loaded later');
  put(ridePath(), text(ridePath()).replace('Description loaded later', 'Own text'));
  r.summary.start_date_local = '2025-01-02T12:00:00';
  r.detail.description = 'Do not overwrite';
  store.save(r);
  expect(text(ridePath('2025-01-02'))).toContain('Own text');
  expect(fs.existsSync(path.join(root, ridePath()))).toBe(false);
  expect(store.read('7').file).toBe(ridePath('2025-01-02'));
});

describe('failure and recovery', () => {
  it.each(['public/streams/7.json', ridePath(), '.strava-cache/activities/7.json'])('rolls back a write failure for %s and allows a retry', (failedPath) => {
    const store = open(); store.save(rec());
    const beforeCache = text('.strava-cache/activities/7.json'), beforeRide = text(ridePath());
    const r = store.read('7'); r.detail.description = 'Update';
    const rename = fs.renameSync;
    let failed = false;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (!failed && to === path.join(root, failedPath)) { failed = true; throw new Error('disk fault'); }
      return rename(from, to);
    });
    expect(() => store.save(r, { streams: { time: [0, 1] }, streamsAt: 2000 })).toThrow('disk fault');
    expect(failed).toBe(true);
    expect(text('.strava-cache/activities/7.json')).toBe(beforeCache);
    expect(text(ridePath())).toBe(beforeRide);
    expect(fs.existsSync(path.join(root, 'public/streams/7.json'))).toBe(false);
    expect(r.streamsFile).toBeUndefined();
    store.save(r, { streams: { time: [0, 1] }, streamsAt: 2000 });
    expect(store.read('7').streamsFile).toBe(true);
  });

  it('fully rolls back a failed date rename with existing streams', () => {
    const store = open();
    store.save(rec(), { streams: { time: [0], watts: [100] }, streamsAt: 1000 });
    const r = store.read('7');
    const beforeCache = text('.strava-cache/activities/7.json'), beforeRide = text(ridePath()), beforeStreams = text('public/streams/7.json');
    r.summary.start_date_local = '2025-01-02T12:00:00';
    const unlink = fs.unlinkSync;
    let failed = false;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      if (!failed && file === path.join(root, ridePath())) { failed = true; throw new Error('rename cleanup fault'); }
      return unlink(file);
    });
    expect(() => store.save(r, { streams: { time: [0], watts: [200] }, streamsAt: 2000 })).toThrow('rename cleanup fault');
    expect(text('.strava-cache/activities/7.json')).toBe(beforeCache);
    expect(text(ridePath())).toBe(beforeRide);
    expect(text('public/streams/7.json')).toBe(beforeStreams);
    expect(fs.existsSync(path.join(root, ridePath('2025-01-02')))).toBe(false);
    store.save(r);
    expect(store.read('7').file).toBe(ridePath('2025-01-02'));
    expect(text(ridePath('2025-01-02'))).toContain('Description from Strava');
  });

  it('restores the previous files on the next open even after a failed rollback', () => {
    const store = open(); store.save(rec());
    const before = text(ridePath());
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === path.join(root, '.strava-cache/activities/7.json')) throw new Error('disk fault');
      return rename(from, to);
    });
    expect(() => store.save(store.read('7'), { streams: { time: [0] }, streamsAt: 2000 })).toThrow();
    vi.restoreAllMocks();
    const recovered = open();
    expect(recovered.read('7').streamsFile).toBeUndefined();
    expect(text(ridePath())).toBe(before);
    expect(fs.existsSync(path.join(root, 'public/streams/7.json'))).toBe(false);
  });

  it('recovers a pending journal left under the pre-rename file name', () => {
    const store = open(); store.save(rec());
    const before = text(ridePath());
    put(ridePath(), 'interrupted write');
    put('public/streams/7.json', '{}');
    put('.strava-cache/fahrt-pending.json', [{ file: ridePath(), text: before }, { file: 'public/streams/7.json', text: null }]);
    open();
    expect(text(ridePath())).toBe(before);
    expect(fs.existsSync(path.join(root, 'public/streams/7.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.strava-cache/fahrt-pending.json'))).toBe(false);
  });
});

function fakeSync({ failDetail = false, failGear = false, noDetail = false, noStreams = false, activities } = {}) {
  class DailyLimitError extends Error {}
  const get = vi.fn(async (url) => {
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
  return { get, geocodeRides, run: () => runSync({ root, get, geocodeRides, DailyLimitError, usage: { calls: 0 }, options: { noDetail, noStreams } }) };
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
  const calls = fake.get.mock.calls.length;
  expect(rebuild({ root })).toBe(4);
  expect(fake.get).toHaveBeenCalledTimes(calls);
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
    expect(processRide(frontmatter(saved, athlete.zones), athleteTimeline({ athlete: { zones: { ftp: 200 } } }).at('2024-05-01')))
      .toMatchObject({ np, tss: source === 'summary' ? 225 : 100 });
    expect(text(ridePath())).toContain(`np: ${np}`);
  };
  check();
  expect(fake.get.mock.calls.some(([url]) => url.startsWith('/activities/'))).toBe(false);
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
  r.metrics = { ...computeMetrics(r.summary, raw, athlete.zones), computed_at: '2020-01-01' };
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
    const fm = frontmatter(saved, athlete.zones);
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
  expect(fake.get.mock.calls.some(([url]) => url.startsWith('/activities/'))).toBe(false);
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

it.each([undefined, 'streams'])('keeps legacy NP of unknown per-metric origin (%s) without inventing an origin', (source) => {
  const r = rec();
  r.summary.weighted_average_watts = 300;
  r.metrics = { ...(source ? { source } : {}), np: 123, variability_index: 1.23, time_in_hr_zones: [30, 40] };
  // No curve is not evidence of summary origin; legacy raw streams no longer exist.
  const expected = structuredClone(r.metrics);
  open().save(r);
  expect(open().read('7').metrics).toEqual(expected);
  rebuild({ root });
  expect(open().read('7').metrics).toEqual(expected);
  expect(frontmatter(open().read('7'), athlete.zones).metrics).toEqual(expected);
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
