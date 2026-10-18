// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRideStorage } from './ride-storage.ts';
import { createAthleteStorage } from './athlete-storage.ts';
import { rebuild } from './rebuild.ts';
import { rideFrontmatter } from '../../shared/ride-file.ts';

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

it('lists ride records newest first and skips cache records without a summary', () => {
  const store = open();
  for (const [id, day] of [['1', '2024-05-01'], ['2', '2024-06-01'], ['3', '2023-01-01']]) {
    store.save({ id, summary: { ...summary(id), start_date: `${day}T12:00:00Z`, start_date_local: `${day}T12:00:00` } });
  }
  put('.strava-cache/activities/4.json', { id: '4', _sync: {} });
  expect(store.list().map((r) => r.id)).toEqual(['2', '1', '3']);
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
  expect(rideFrontmatter(open().read('7')).metrics).toEqual(expected);
});
