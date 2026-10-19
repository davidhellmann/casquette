import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBackfill } from './backfill.ts';
import type { BackfillKind } from './backfill.ts';
import { createRideStorage } from './ride-storage.ts';
import { createStravaFake } from './strava-fake.ts';
import type { StravaFake } from './strava-fake.ts';
import type { StravaStreams } from './strava.ts';
import type { Distribution } from '../../shared/metrics.ts';

let root: string;
const ride = (id: string) => `src/content/rides/2024/2024-05-01_${id}.md`;
const cache = (id: string) => `.strava-cache/activities/${id}.json`;
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
const before = (id: string) => `---\nid: "${id}"\ngeo: "newer than cache"\nmetrics:\n  source: "streams"\n  np: 220\n  time_in_power_zones: [10, 20]\n  time_in_power_zones_basis:\n    source: "legacy"\n    ftp: 300\n    zones: null\n    exact: false\n  power_curve:\n    60: 300\n  time_in_hr_zones: [1, 2]\nlaps: []\n---\n\nOwn text\n`;
const fixture = (id: string) => {
  put(cache(id), JSON.stringify({ id, summary: { start_date: '2024-05-01T12:00:00Z' }, geo: 'stale',
    metrics: { np: 220, ftp_used: 300, time_in_power_zones: [10, 20], power_curve: { 60: 300 } }, _sync: { streams: 123 } }));
  put(ride(id), before(id));
};
const streams: StravaStreams = { time: { data: [0, 1, 2, 30, 31] }, watts: { data: [50, 0, 201.25, 100, 300] } };
const run = (strava: StravaFake, kinds: BackfillKind[] = ['power']) => runBackfill({ root, strava, kinds });
const answering = (value: unknown) => createStravaFake(() => value);
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it('adds only the power distribution despite completed streams; keeps unrelated fields and resumes without refetching', async () => {
  fixture('7');
  const strava = answering(streams);
  expect(await run(strava)).toMatchObject({ saved: 1, remaining: 0 });
  expect(strava.calls).toEqual([['/activities/7/streams', { keys: 'time,watts', key_by_type: true }, { wait: false }]]);
  const saved = JSON.parse(read(cache('7')));
  expect(saved.metrics.power_distribution.samples).toEqual([[0, 1], [201.25, 1], [300, 1]]);
  expect(saved.metrics).not.toHaveProperty('ftp_used');
  expect(saved.metrics).not.toHaveProperty('time_in_power_zones');
  expect(saved._sync.streams).toBe(123);
  expect(read(ride('7'))).toContain('geo: "newer than cache"');
  expect(read(ride('7'))).toContain('  power_curve:\n    60: 300\n  time_in_hr_zones: [1, 2]\n');
  expect(read(ride('7'))).toContain('laps: []\n---\n\nOwn text\n');
  expect(read(ride('7'))).not.toMatch(/time_in_power_zones|ftp:/);
  expect(await run(strava)).toMatchObject({ total: 0, saved: 0 });
  expect(strava.calls).toHaveLength(1);
});

it('keeps legacy data when streams are missing and stops resumably at the daily limit', async () => {
  fixture('7'); fixture('8'); fixture('9');
  const answers: (StravaStreams | null)[] = [streams, null];
  const strava: StravaFake = createStravaFake(() => { if (!answers.length) throw strava.dailyLimit(); return answers.shift(); });
  expect(await run(strava)).toMatchObject({ saved: 1, unavailable: ['8'], stopped: true, remaining: 2 });
  expect(read(ride('8'))).toBe(before('8'));
  expect(read(ride('9'))).toBe(before('9'));
  expect(await run(answering(streams))).toMatchObject({ saved: 2, remaining: 0 });
});

it('rolls back Markdown and cache together on a write failure', async () => {
  fixture('7');
  const oldCache = read(cache('7'));
  const rename = fs.renameSync;
  let fail = true;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (fail && to === path.join(root, cache('7'))) { fail = false; throw new Error('disk fault'); }
    return rename(from, to);
  });
  expect(await run(answering(streams))).toMatchObject({ saved: 0, failed: ['7'] });
  expect(read(ride('7'))).toBe(before('7'));
  expect(read(cache('7'))).toBe(oldCache);
  expect(await run(answering(streams))).toMatchObject({ saved: 1 });
});

it('refuses unknown Markdown and invalid distributions without writing', () => {
  fixture('7');
  const store = createRideStorage({ root });
  expect(() => store.saveDistributions('7', { hr_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[-1, 1]] } })).toThrow('Invalid HR distribution');
  // An incomplete distribution on purpose: storage checks what it gets.
  expect(() => store.saveDistributions('7', { power_distribution: { samples: [] } as Partial<Distribution> as Distribution })).toThrow('Invalid power distribution');
  put(ride('7'), '---\nid: "7"\n---\nText');
  const oldCache = read(cache('7'));
  expect(() => store.saveDistributions('7', { power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[200, 1]] } })).toThrow('metrics missing');
  expect(read(cache('7'))).toBe(oldCache);
});

describe('HR backfill', () => {
  const hrStreams: StravaStreams = { time: { data: [0, 1, 2, 30, 31] }, heartrate: { data: [120, 0, 141, 150, 175] } };
  const hrBasis = '  time_in_hr_zones_basis:\n    source: "sync"\n    zones:\n      - min: 0\n        max: 139\n      - min: 140\n        max: null\n';
  const hrOnly = (id: string) => {
    put(cache(id), JSON.stringify({ id, summary: { start_date: '2024-05-01T12:00:00Z' },
      metrics: { np: 220, power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[200, 5]] }, time_in_hr_zones: [1, 2] } }));
    put(ride(id), `---\nid: "${id}"\nmetrics:\n  source: "streams"\n  np: 220\n  time_in_hr_zones: [1, 2]\n${hrBasis}  hr_curve:\n    60: 170\nlaps: []\n---\n\nOwn text\n`);
  };

  it('adds the HR distribution in place of the stored HR time in zones and resumes without refetching', async () => {
    hrOnly('7');
    const strava = answering(hrStreams);
    expect(await run(strava, ['hr'])).toMatchObject({ saved: 1, remaining: 0 });
    expect(strava.calls).toEqual([['/activities/7/streams', { keys: 'time,heartrate', key_by_type: true }, { wait: false }]]);
    const saved = JSON.parse(read(cache('7')));
    expect(saved.metrics.hr_distribution.samples).toEqual([[0, 1], [141, 1], [175, 1]]);
    expect(saved.metrics).not.toHaveProperty('time_in_hr_zones');
    expect(saved.metrics.power_distribution.samples).toEqual([[200, 5]]);
    const md = read(ride('7'));
    expect(md).not.toMatch(/time_in_hr_zones/);
    expect(md).toContain('  hr_curve:\n    60: 170\n');
    expect(md).toContain('  hr_distribution:\n');
    expect(md).toContain('laps: []\n---\n\nOwn text\n');
    expect(await run(strava, ['hr'])).toMatchObject({ total: 0, saved: 0 });
    expect(strava.calls).toHaveLength(1);
  });

  it('fetches power and heart rate in one request when a ride needs both', async () => {
    fixture('7'); hrOnly('8');
    const both = JSON.parse(read(cache('7')));
    put(cache('7'), JSON.stringify({ ...both, metrics: { ...both.metrics, time_in_hr_zones: [1, 2] } }));
    const strava = createStravaFake((_path, { keys }) => String(keys).includes('watts') ? { ...streams, ...hrStreams, time: streams.time } : hrStreams);
    expect(await run(strava, ['power', 'hr'])).toMatchObject({ total: 2, saved: 2, remaining: 0 });
    expect(strava.calls).toContainEqual(['/activities/7/streams', { keys: 'time,watts,heartrate', key_by_type: true }, { wait: false }]);
    expect(strava.calls).toContainEqual(['/activities/8/streams', { keys: 'time,heartrate', key_by_type: true }, { wait: false }]);
    const seven = JSON.parse(read(cache('7'))).metrics;
    expect(seven.power_distribution).toBeTruthy();
    expect(seven.hr_distribution).toBeTruthy();
    expect(read(ride('7'))).not.toMatch(/time_in_(power|hr)_zones/);
  });

  it('keeps the stored HR time in zones when the ride has no usable heart rate samples', async () => {
    hrOnly('7');
    const before = read(ride('7'));
    expect(await run(answering({ time: { data: [0, 1] } }), ['hr'])).toMatchObject({ saved: 0, unavailable: ['7'], remaining: 1 });
    expect(read(ride('7'))).toBe(before);
  });
});
