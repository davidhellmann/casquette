import { describe, expect, it } from 'vitest';
import { records, RECORD_KINDS } from './index.js';

let seq = 0;
const ride = (id, extra = {}) => ({
  id, start: Date.parse('2024-05-01T08:00:00Z') + (seq++) * 86400000, d: new Date(2024, 4, 1),
  distance: 30000, moving_time: 3600, elev: 300, speed: 8, np: 200, load: 50, pr: 1, hr_max: 170, indoor: false, ...extra,
});
const shuffle = (a) => [a[2], a[0], a[3], a[1], ...a.slice(4)];

describe('records', () => {
  it('returns the ride with the highest positive value per kind', () => {
    const rides = [ride('a'), ride('b', { distance: 90000, elev: 1200, load: 140, pr: 5, hr_max: 190, moving_time: 9000 }), ride('c', { np: 280, speed: 10 })];
    const R = records(rides);
    expect(Object.keys(R)).toEqual(RECORD_KINDS);
    expect(Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.id]))).toEqual({
      longest: 'b', longestTime: 'b', climb: 'b', fastest: 'c', np: 'c', load: 'b', prs: 'b', maxHr: 'b',
    });
  });

  it('counts NP only from 20 minutes and outdoor speed only from 30 minutes', () => {
    const R = records([
      ride('shortNp', { moving_time: 1199, np: 500, speed: 20 }),
      ride('np20', { moving_time: 1200, np: 300, speed: 20 }),
      ride('indoor', { indoor: true, speed: 15 }),
      ride('speed30', { moving_time: 1800, speed: 9 }),
    ]);
    expect(R.np.id).toBe('np20');
    expect(R.fastest.id).toBe('speed30');
  });

  it('never makes unknown or 0 a record', () => {
    const R = records([ride('x', { np: null, pr: 0, hr_max: null, load: 0 })]);
    expect(R).toMatchObject({ np: null, prs: null, maxHr: null, load: null });
    expect(R.longest.id).toBe('x');
  });

  it('gives a tie to the more recent ride, whatever the input order', () => {
    const rides = [ride('old'), ride('mid'), ride('new'), ride('newest', { distance: 1000 })];
    for (const order of [rides, rides.slice().reverse(), shuffle(rides)]) {
      const R = records(order);
      expect(R.longest.id).toBe('new');
      expect(R.climb.id).toBe('newest');
    }
  });

  it('falls back to the local start for rides without an actual start', () => {
    const a = ride('a', { start: null, d: new Date(2024, 0, 1) }), b = ride('b', { start: null, d: new Date(2024, 0, 2) });
    expect(records([b, a]).longest.id).toBe('b');
    expect(records([a, b]).longest.id).toBe('b');
  });

  it('returns null for every kind without rides', () => {
    expect(records([])).toEqual(Object.fromEntries(RECORD_KINDS.map((k) => [k, null])));
  });
});
