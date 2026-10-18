// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { chartStreamsLoader, displayIndices, rollingMean, streamRows } from './chart-streams.ts';
import { routes } from './routes.ts';

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
    const { rows } = streamRows({ time, watts, heart_rate: time.map(() => 140) }, { max: 800 });
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

describe('smoothing', () => {
  it('evens out values with a moving average', () => {
    expect(rollingMean([0, 10, null, 20], 1)).toEqual([5, 5, 15, 20]);
  });

  it('smooths power and cadence only, before downsampling', () => {
    const st = { time: [0, 1, 2], watts: [100, 400, 100], cadence: [60, 90, 60], heart_rate: [120, 150, 120] };
    const { rows } = streamRows(st, { smooth: 1 });
    expect(rows.map((r) => r.watts)).toEqual([250, 200, 250]);
    expect(rows.map((r) => r.cad)).toEqual([75, 70, 75]);
    expect(rows.map((r) => r.hr)).toEqual([120, 150, 120]);
  });
});

describe('loading chart streams', () => {
  const response = (body, ok = true) => ({ ok, json: async () => body });

  it('fetches a ride\'s streams from its URL once', async () => {
    const calls = [];
    const fetch = async (url) => { calls.push(url); return response({ time: [0, 1] }); };
    const loader = chartStreamsLoader({ fetch });
    expect(await loader.load('7')).toEqual({ time: [0, 1] });
    expect(await loader.load('7')).toEqual({ time: [0, 1] });
    expect(calls).toEqual([routes.streams('7')]);
  });

  it('resolves to null for missing streams, network errors and invalid JSON', async () => {
    expect(await chartStreamsLoader({ fetch: async () => response(null, false) }).load('1')).toBeNull();
    expect(await chartStreamsLoader({ fetch: async () => { throw new TypeError('offline'); } }).load('1')).toBeNull();
    expect(await chartStreamsLoader({ fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }) }).load('1')).toBeNull();
  });
});
