import { describe, expect, it } from 'vitest';
import { attemptRows, prHistory, segmentTrack, timeTicks, wattsPoints } from './segment-data.ts';

// Attempts in date order, as in the detail payload (src/pages/segments/[id].astro)
const E = [
  { ride: 'a', name: 'First', date: '2024-05-01', t: 300, w: 200, hr: 150, pr: 1 },
  { ride: 'b', name: 'Slower', date: '2024-06-01', t: 320, w: null, hr: null, pr: null },
  { ride: 'c', name: 'Faster', date: '2024-07-01', t: 290, w: 230.4, hr: 160, pr: 1 },
  { ride: 'd', name: 'Tie', date: '2024-08-01', t: 290, w: 0, hr: 155, pr: 2 },
  { ride: 'e', name: 'Fastest', date: '2024-09-01', t: 280, w: 251, hr: 165, pr: 1 },
];

describe('attemptRows', () => {
  it('pairs each attempt with the best time so far', () => {
    expect(attemptRows(E).map((r) => [r.i, r.t, r.best])).toEqual([[0, 300, 300], [1, 320, 300], [2, 290, 290], [3, 290, 290], [4, 280, 280]]);
    expect(attemptRows(E)[2]).toMatchObject({ ride: 'c', name: 'Faster', date: '2024-07-01', w: 230.4, hr: 160, pr: 1 });
  });
});

describe('prHistory', () => {
  it('lists every attempt that set a new best time, newest first, with the gain on the previous best', () => {
    expect(prHistory(E)).toEqual([
      { ride: 'e', name: 'Fastest', date: '2024-09-01', t: 280, gain: 10 },
      { ride: 'c', name: 'Faster', date: '2024-07-01', t: 290, gain: 10 },
      { ride: 'a', name: 'First', date: '2024-05-01', t: 300, gain: null },
    ]);
  });
  it('is empty without attempts', () => expect(prHistory([])).toEqual([]));
});

describe('wattsPoints', () => {
  it('keeps the attempts with power, rounded to whole watts', () => {
    expect(wattsPoints(E).map((p) => [p.w, p.t, p.ride])).toEqual([[200, 300, 'a'], [230, 290, 'c'], [251, 280, 'e']]);
  });
  it('needs at least two attempts with power', () => {
    expect(wattsPoints(E.slice(0, 2))).toEqual([]);
  });
});

describe('segmentTrack', () => {
  // A stream thinned from 1000 to 10 points: segment indexes refer to the original 1000
  const stream = {
    points: 10, original_points: 1000,
    latlng: Array.from({ length: 10 }, (_, i): [number, number] => [48 + i / 100, 11 + i / 100]),
    altitude: [500, 510, 520, 530, 540, 550, 560, 570, 580, 590],
    distance: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  };

  it('cuts the segment out of the thinned stream: route and elevation profile from its start', () => {
    const tr = segmentTrack(stream, { si: 300, ei: 590 }, 300);
    expect(tr?.latlng).toEqual([[48.03, 11.03], [48.04, 11.04], [48.05, 11.05], [48.06, 11.06]]);
    expect(tr?.profile).toEqual([{ km: 0, alt: 530 }, { km: 0.1, alt: 540 }, { km: 0.2, alt: 550 }, { km: 0.3, alt: 560 }]);
  });
  it('spreads the profile over the segment distance when the stream has no distance', () => {
    const tr = segmentTrack({ ...stream, distance: undefined }, { si: 300, ei: 590 }, 400);
    expect(tr?.profile.map((p) => p.km)).toEqual([0, 0.1, 0.2, 0.3]);
  });
  it('has no route without at least two GPS points, no profile without altitude', () => {
    expect(segmentTrack({ ...stream, latlng: undefined }, { si: 0, ei: 900 }, 900)).toBeNull();
    expect(segmentTrack(stream, { si: 300, ei: 300 }, 0)).toBeNull();
    expect(segmentTrack({ ...stream, altitude: undefined }, { si: 300, ei: 590 }, 300)?.profile).toEqual([]);
  });
});

describe('timeTicks', () => {
  it('steps in round clock units that cover the attempts', () => {
    expect(timeTicks([595, 806]).ticks).toEqual([540, 600, 660, 720, 780, 840]);
    expect(timeTicks([121, 130]).ticks).toEqual([120, 125, 130]);
    expect(timeTicks([3000, 4100]).domain).toEqual([3000, 4200]);
  });
  it('handles a single attempt', () => {
    expect(timeTicks([300]).ticks).toEqual([299, 300, 301]);
  });
});
