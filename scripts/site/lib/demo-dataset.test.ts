import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { heroRide, readDemoDataset, reviewYear, rideYears } from './demo-dataset.ts';

let root: string;
const put = (rel: string, text: string | object) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), typeof text === 'string' ? text : JSON.stringify(text));
};
const rideFile = (id: string, local: string, extra = '') => `---\nid: "${id}"\nstart_date: "${local}Z"\nstart_date_local: "${local}"\ntrainer: false\ndistance: 42195.5\n${extra}---\n\nNotes\n`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-dataset-'));
  put('demo/data/meta.json', { newest_day: '2025-12-27' });
  put('demo/rides/2025/2025-06-14_demo-0001.md', rideFile('demo-0001', '2025-06-14T08:00:00'));
  put('demo/rides/2025/2025-12-27_demo-0002.md', rideFile('demo-0002', '2025-12-27T09:30:00',
    'segment_efforts:\n  - name: "Box Hill"\n    segment_id: "demo-seg-box-hill"\n  - name: "Zig Zag"\n    segment_id: "demo-seg-zig-zag"\n'));
  put('demo/gear/bdemo2.md', '---\nid: "bdemo2"\n---\n');
  put('demo/gear/bdemo1.md', '---\nid: "bdemo1"\n---\n');
  put('demo/streams/demo-0002.json', { time: [0] });
  put('demo/streams/.gitkeep', '');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('readDemoDataset', () => {
  it('reads rides, their segments, bikes and streams of the demo dataset', () => {
    const data = readDemoDataset({ root, today: new Date(2025, 11, 28) });
    expect(data.dir).toBe(path.join(root, 'demo'));
    expect(data.meta.newest_day).toBe('2025-12-27');
    expect(data.rides.map((r) => r.id)).toEqual(['demo-0001', 'demo-0002']);
    expect(data.rides[0]).toMatchObject({ trainer: false, distance: 42195.5 });
    expect(data.rides[1].segment_efforts).toEqual([{ segment_id: 'demo-seg-box-hill' }, { segment_id: 'demo-seg-zig-zag' }]);
    expect(data.gear).toEqual(['bdemo1', 'bdemo2']);
    expect(data.streams).toEqual(['demo-0002']);
  });

  it('leaves the dates alone while the newest ride is within the last week', () => {
    const data = readDemoDataset({ root, today: new Date(2026, 0, 2) });
    expect(data.shift).toBe(0);
    expect(data.rides[1].start_date_local).toBe('2025-12-27T09:30:00');
  });

  it('moves the dates forward in whole weeks like the build, across the year boundary', () => {
    const data = readDemoDataset({ root, today: new Date(2026, 0, 5) });
    expect(data.shift).toBe(7);
    expect(data.rides.map((r) => r.start_date_local)).toEqual(['2025-06-21T08:00:00', '2026-01-03T09:30:00']);
    expect(data.rides[1].start_date).toBe('2026-01-03T09:30:00Z');
    // The newest ride now falls into the new year: it is the running year, the review shows the one before
    expect(rideYears(data.rides)).toEqual([2026, 2025]);
    expect(reviewYear(data.rides)).toBe(2025);
    expect(reviewYear(readDemoDataset({ root, today: new Date(2026, 0, 2) }).rides)).toBe(2025);
  });

  it('reads a dataset without meta or optional folders as an unshifted one', () => {
    fs.rmSync(path.join(root, 'demo', 'data'), { recursive: true });
    fs.rmSync(path.join(root, 'demo', 'streams'), { recursive: true });
    const data = readDemoDataset({ root, today: new Date(2030, 0, 1) });
    expect(data.shift).toBe(0);
    expect(data.streams).toEqual([]);
  });

  it('reads the shipped demo dataset', () => {
    const data = readDemoDataset();
    expect(data.rides.length).toBeGreaterThan(100);
    expect(data.gear.length).toBeGreaterThan(0);
    expect(heroRide(data.rides)).toMatch(/^demo-\d+$/);
  });
});

describe('rideYears', () => {
  it('lists every year with rides once, newest first, from the local start date', () => {
    const rides = [{ start_date_local: '2025-12-31T23:30:00' }, { start_date_local: '2026-01-01T08:00:00' }, { start_date_local: '2025-06-01T08:00:00' }, { start_date_local: 'not a date' }];
    expect(rideYears(rides)).toEqual([2026, 2025]);
  });
});

describe('reviewYear', () => {
  const ridesIn = (...years: number[]) => years.map((y) => ({ start_date_local: `${y}-05-01T08:00:00` }));

  it('shows the last complete year, not the running one', () => {
    expect(reviewYear(ridesIn(2024, 2026, 2023, 2025))).toBe(2025);
  });

  it('falls back to the only year there is', () => {
    expect(reviewYear(ridesIn(2026))).toBe(2026);
  });
});

describe('heroRide', () => {
  const ride = (id: string, extra = {}) => ({ id, start_date_local: '2025-06-01T08:00:00', trainer: false, device_watts: true, has_heartrate: true, summary_polyline: 'abc', ...extra });

  it('picks the newest outdoor ride that has power, heart rate and a route', () => {
    const rides = [
      ride('demo-0003'),
      ride('demo-0010', { trainer: true }),
      ride('demo-0009', { device_watts: false }),
      ride('demo-0008', { has_heartrate: false }),
      ride('demo-0007', { summary_polyline: '' }),
      ride('demo-0005'),
    ];
    expect(heroRide(rides)).toBe('demo-0005');
  });

  it('fails loudly when no ride can carry the ride page', () => {
    expect(() => heroRide([ride('demo-0001', { trainer: true })])).toThrow(/no ride/i);
  });
});
