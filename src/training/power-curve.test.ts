// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, it, expect } from 'vitest';
import { bestCurve } from './index.ts';

describe('bestCurve – best curve across several rides', () => {
  it('takes the highest power per duration and remembers its ride', () => {
    const rides = [
      { id: 'a', best: { 5: 900, 60: 400, 1200: 250 } },
      { id: 'b', best: { 5: 850, 60: 420, 1200: 260 } },
    ];
    expect(bestCurve(rides)).toEqual({ 5: { w: 900, id: 'a' }, 60: { w: 420, id: 'b' }, 1200: { w: 260, id: 'b' } });
  });

  it('skips rides without a power curve and durations without a value', () => {
    const rides = [
      { id: 'a', best: null },
      { id: 'b' },
      { id: 'c', best: { 5: 700, 60: 0, 300: null } },
    ];
    expect(bestCurve(rides)).toEqual({ 5: { w: 700, id: 'c' } });
  });

  it('keeps the ride passed first on a tie', () => {
    expect(bestCurve([{ id: 'a', best: { 5: 800 } }, { id: 'b', best: { 5: 800 } }])[5].id).toBe('a');
  });

  it('returns an empty curve for no rides', () => {
    expect(bestCurve([])).toEqual({});
  });
});
