import { describe, expect, it } from 'vitest';
import { displayIndices, rideCurveData, rollingMean, streamRows, zoneBands, zoneRuns } from './ride-data.js';

const ZONES = [{ min: 0, max: 100 }, { min: 101, max: 200 }, { min: 201, max: null }];

describe('stream rows for display', () => {
  it('keeps short streams as they are', () => {
    const st = { time: [0, 1, 2], watts: [100, 200, 300], heart_rate: [120, 121, 122], velocity: [10, 10, 5], distance: [0, 10, 2500] };
    const { rows, keys } = streamRows(st);
    expect(keys).toEqual(['watts', 'hr', 'kmh']);
    expect(rows).toEqual([
      { i: 0, t: 0, km: 0, watts: 100, hr: 120, kmh: 36 },
      { i: 1, t: 1, km: 0.01, watts: 200, hr: 121, kmh: 36 },
      { i: 2, t: 2, km: 2.5, watts: 300, hr: 122, kmh: 18 },
    ]);
  });

  it('downsamples a long ride and keeps its spikes, first and last sample', () => {
    const n = 21600;
    const time = Array.from({ length: n }, (_, i) => i);
    const watts = time.map((i) => (i === 12345 ? 1500 : i === 777 ? 0 : 200 + (i % 7)));
    const { rows } = streamRows({ time, watts, heart_rate: time.map(() => 140) }, 800);
    expect(rows.length).toBeLessThanOrEqual(802);
    expect(rows.length).toBeGreaterThan(400);
    expect(rows[0].i).toBe(0);
    expect(rows.at(-1).i).toBe(n - 1);
    expect(Math.max(...rows.map((r) => r.watts))).toBe(1500);
    expect(Math.min(...rows.map((r) => r.watts))).toBe(0);
    // Sample indices ascending, every series taken from the same sample
    expect(rows.every((r, k) => k === 0 || r.i > rows[k - 1].i)).toBe(true);
    expect(rows.every((r) => r.t === r.i && r.hr === 140)).toBe(true);
  });

  it('leaves out missing or all-zero streams', () => {
    const { keys } = streamRows({ time: [0, 1], watts: [0, 0], cadence: [80, 90], altitude: null });
    expect(keys).toEqual(['cad']);
    expect(streamRows(null)).toEqual({ rows: [], keys: [] });
  });

  it('picks evenly spaced samples without a primary series', () => {
    const idx = displayIndices(null, 1000, 100);
    expect(idx[0]).toBe(0);
    expect(idx.at(-1)).toBe(999);
    expect(idx.length).toBeLessThanOrEqual(52);
  });
});

describe('route colouring', () => {
  it('splits the route into connected runs per zone', () => {
    const pts = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]];
    const runs = zoneRuns(pts, [50, 60, 150, 250, null], ZONES);
    expect(runs.map((r) => r.zone)).toEqual([1, 2, 3]);
    expect(runs[1].points[0]).toEqual([2, 2]);
    expect(runs[2].points).toEqual([[3, 3], [4, 4], [5, 5]]);
  });

  it('draws one run without values and skips points without a position', () => {
    expect(zoneRuns([[1, 1], null, [2, 2]], null, null)).toEqual([{ zone: 0, points: [[1, 1], [2, 2]] }]);
  });

  it('evens out values with a moving average', () => {
    expect(rollingMean([0, 10, null, 20], 1)).toEqual([5, 5, 15, 20]);
  });
});

describe('stream colouring', () => {
  it('splits the value axis into zone bands, top to bottom, as fractions of its height', () => {
    const bands = zoneBands(ZONES, 0, 300);
    expect(bands.map((b) => b.zone)).toEqual([3, 2, 1]);
    expect(bands[0]).toEqual({ zone: 3, from: 0, to: 0.33 });
    expect(bands[1].from).toBe(0.33);
    expect(bands[1].to).toBeCloseTo(0.6633, 4);
    expect(bands[2].from).toBeCloseTo(0.6633, 4);
    expect(bands[2].to).toBe(1);
  });

  it('keeps only the zones the axis shows', () => {
    // Heart-rate axis 120–180 bpm: Z1 below 101 is off the axis, Z3 starts at 201 above it
    expect(zoneBands(ZONES.map((z) => ({ min: z.min, max: z.max })), 120, 180)).toEqual([{ zone: 2, from: 0, to: 1 }]);
    expect(zoneBands(ZONES, 150, 250)).toEqual([{ zone: 3, from: 0, to: 0.49 }, { zone: 2, from: 0.49, to: 1 }]);
  });

  it('has no bands without zones or without an axis', () => {
    expect(zoneBands(null, 0, 300)).toEqual([]);
    expect(zoneBands([], 0, 300)).toEqual([]);
    expect(zoneBands(ZONES, 100, 100)).toEqual([]);
  });
});

describe('ride power curve', () => {
  it('compares the ride with the year and all-time bests from 5 s on', () => {
    const rows = rideCurveData({
      own: { 1: 900, 5: 800, 60: 400, 1200: null },
      year: { 5: 850, 60: 380 },
      allTime: { 5: 1000, 60: 450, 1200: 300 },
      wkg: { own: { 5: 10, 60: 5 }, year: { 5: 11 }, allTime: { 5: 12, 60: 6 } },
    });
    expect(rows).toEqual([
      { s: 5, ride: 800, rideWkg: 10, year: 850, yearWkg: 11, all: 1000, allWkg: 12 },
      { s: 60, ride: 400, rideWkg: 5, year: 380, yearWkg: null, all: 450, allWkg: 6 },
    ]);
  });
});
