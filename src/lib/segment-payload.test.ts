import { describe, expect, it } from 'vitest';
import { fixtureDataset } from './dataset-fixture.ts';
import { segmentPageIds, segmentPayload, segmentsIndexPayload } from './segment-payload.ts';

describe('segment payloads', () => {
  it('lists every segment of the admitted stat rides, most ridden first; pages only for two attempts or more', async () => {
    const data = await fixtureDataset();
    const P = segmentsIndexPayload(data);
    expect(P).toMatchObject({ climbs: 1, attempts: 3, prs: 1, fav: { id: 'demo-seg-hill', name: 'Hill', n: 2, page: true } });
    expect(P.rows.map((r) => [r.id, r.attempts, r.page, r.climb, r.virtual, r.best, r.bestOn, r.strava])).toEqual([
      ['demo-seg-hill', 2, true, true, false, 300, '2024-04-20', null],
      ['demo-seg-flat', 1, false, false, true, 90, '2024-06-14', null],
    ]);
    expect(P.rows[0].lastDelta).toBe(0);
    expect(P.rows[1].lastDelta).toBeUndefined();
    expect(segmentPageIds(data)).toEqual(['demo-seg-hill']);
  });

  it('describes a segment page: bests, attempts with bike and body weight, and the tracks with streams', async () => {
    const S = segmentPayload(await fixtureDataset(), { id: 'demo-seg-hill' });
    expect(S).toMatchObject({
      id: 'demo-seg-hill', name: 'Hill', tags: ['Hilltown', 'Cat. 4'], distance: 2000, grade: 5, strava: null,
      best: { date: '2024-04-20', t: 300 }, first: { date: '2023-05-10', t: 320 }, last: { date: '2024-04-20', t: 300 },
      median: 320, bestSpeed: 24, improvement: 6.25, lastDelta: 0, bestW: 270, prs: 1,
    });
    expect(S.bestWkg).toBeCloseTo(270 / 70);
    expect(S.efforts.map((e) => [e.ride, e.t, e.w, e.kg, e.bike])).toEqual([
      ['demo-0001', 320, 260, 72, 'Gravel bike'],
      ['demo-0002', 300, 270, 70, 'Gravel bike'],
    ]);
    expect(S.tracks).toEqual([{ ride: 'demo-0002', si: 1, ei: 2 }]);
  });

  it('has no page for a segment ridden once', async () => {
    const data = await fixtureDataset();
    expect(() => segmentPayload(data, { id: 'demo-seg-flat' })).toThrow('No segment page demo-seg-flat');
  });
});
