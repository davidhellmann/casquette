// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, it, expect } from 'vitest';
import { rideLoad, fitnessSeries, CTL_DAYS, ATL_DAYS } from './index.ts';

describe('rideLoad – load of a ride', () => {
  it('uses TSS, otherwise Relative Effort, otherwise 0', () => {
    expect(rideLoad({ tss: 80, re: 120 })).toBe(80);
    expect(rideLoad({ tss: 0, re: 120 })).toBe(0);
    expect(rideLoad({ tss: null, re: 120 })).toBe(120);
    expect(rideLoad({ tss: null, re: null })).toBe(0);
    expect(rideLoad({})).toBe(0);
  });
});

describe('fitnessSeries – CTL/ATL series per day', () => {
  it('uses 42/7 days as time constants', () => {
    expect(CTL_DAYS).toBe(42);
    expect(ATL_DAYS).toBe(7);
  });

  it('returns one entry per calendar day and lets fitness/fatigue decay on days without training', () => {
    const s = fitnessSeries([{ day: '2024-05-01', tss: 42 }], { to: '2024-05-03' });
    expect(s.map((x) => x.day)).toEqual(['2024-05-01', '2024-05-02', '2024-05-03']);
    expect(s.map((x) => x.load)).toEqual([42, 0, 0]);
    expect(s[0].ctl).toBeCloseTo(1);
    expect(s[0].atl).toBeCloseTo(6);
    expect(s[1].ctl).toBeCloseTo(41 / 42);
    expect(s[1].atl).toBeCloseTo(36 / 7);
    expect(s[2].ctl).toBeCloseTo((41 / 42) ** 2);
    expect(s[2].atl).toBeCloseTo(6 * (6 / 7) ** 2);
  });

  it('reports form (TSB) as fitness minus fatigue of the previous day', () => {
    const s = fitnessSeries([{ day: '2024-05-01', tss: 42 }], { to: '2024-05-02' });
    expect(s[0].tsb).toBe(0);
    expect(s[1].tsb).toBeCloseTo(1 - 6);
  });

  it('sums several rides on the same day', () => {
    const s = fitnessSeries([{ day: '2024-05-01', tss: 20 }, { day: '2024-05-01', re: 22 }], { to: '2024-05-01' });
    expect(s[0].load).toBe(42);
  });

  it('starts earlier when asked (load 0) and ignores rides outside the period', () => {
    const s = fitnessSeries([{ day: '2024-04-01', tss: 500 }, { day: '2024-05-02', tss: 42 }, { day: '2024-05-09', tss: 99 }], { from: '2024-05-01', to: '2024-05-02' });
    expect(s.map((x) => [x.day, x.load, x.ctl])).toEqual([['2024-05-01', 0, 0], ['2024-05-02', 42, 1]]);
  });

  it('counts days correctly across month boundaries and DST changes', () => {
    expect(fitnessSeries([], { from: '2024-03-30', to: '2024-04-01' }).map((x) => x.day)).toEqual(['2024-03-30', '2024-03-31', '2024-04-01']);
    expect(fitnessSeries([], { from: '2024-10-26', to: '2024-10-28' })).toHaveLength(3);
  });

  it('is empty without rides and without a start', () => {
    expect(fitnessSeries([], { to: '2024-05-01' })).toEqual([]);
  });

  it('returns the same fitness today for the same rides regardless of order and an earlier start (dashboard vs. /performance)', () => {
    const rides = [];
    for (let i = 0; i < 200; i += 3) rides.push({ day: `2024-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, tss: i % 2 ? 60 + i : null, re: 40 + (i % 17) });
    const asc = fitnessSeries(rides, { to: '2024-09-15' });
    const desc = fitnessSeries(rides.slice().reverse(), { from: '2023-11-20', to: '2024-09-15' });
    expect(desc.at(-1)).toEqual(asc.at(-1));
  });
});
