import { describe, expect, it } from 'vitest';
import { rideCurveData, zoneBands, zoneRuns } from './ride-data.ts';

const ZONES = [{ min: 0, max: 100 }, { min: 101, max: 200 }, { min: 201, max: null }];

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
