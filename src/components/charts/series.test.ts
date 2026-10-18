import { describe, expect, it } from 'vitest';
import { SERIES, niceTicks, thin } from './series';

describe('niceTicks', () => {
  it('uses round steps that cover the data', () => {
    expect(niceTicks(-30, 70)).toEqual([-50, -25, 0, 25, 50, 75]);
    expect(niceTicks(0, 9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(120, 340, 5)).toEqual([100, 200, 300, 400]);
  });
  it('handles a flat series', () => {
    expect(niceTicks(5, 5)).toEqual([4, 4.5, 5, 5.5, 6]);
  });
});

describe('thin', () => {
  it('keeps short series and the last point of long ones', () => {
    const short = Array.from({ length: 700 }, (_, i) => i);
    expect(thin(short)).toBe(short);
    const long = Array.from({ length: 1500 }, (_, i) => i);
    const out = thin(long);
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.at(-1)).toBe(1499);
  });
});

describe('SERIES', () => {
  it('draws aggregated values (per-month bests, rolling eFTP, W/kg) smooth, measurements hard and held values as steps', () => {
    for (const k of ['eftp', 'best20', 'wkg', 'fitness', 'distanceCompare'] as const) expect(SERIES[k].curve, k).toBe('monotone');
    for (const k of ['streamPower', 'streamHeartRate', 'segmentAttempt', 'segmentWatts'] as const) expect(SERIES[k].curve, k).toBe('linear');
    for (const k of ['ftp', 'weight', 'segmentBest'] as const) expect(SERIES[k].curve, k).toBe('stepAfter');
  });
});
