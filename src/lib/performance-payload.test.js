import { describe, expect, it } from 'vitest';
import { fixtureDataset } from './dataset-fixture.js';
import { performancePayload } from './performance-payload.ts';

describe('performancePayload', () => {
  it('shows today\'s FTP and body weight, all-time bests and the history newest first', async () => {
    const P = performancePayload(await fixtureDataset());
    expect(P).toMatchObject({ ftp: 260, kg: 70, rides: 3, years: 1, lastYear: 2023 });
    expect(P.bests).toEqual([
      { label: '5 s', w: 850, wkg: 12.14 }, { label: '1 min', w: 400, wkg: 5.56 },
      { label: '5 min', w: null, wkg: null }, { label: '20 min', w: 280, wkg: 4 },
    ]);
    expect(P.durations).toEqual(['5 s', '1 min', '5 min', '20 min', '60 min']);
    expect(P.history).toEqual([
      { date: '2024-03-01', ftp: 260, weight: 70, source: null, note: 'Spring' },
      { date: '2023-01-01', ftp: 240, weight: 72, source: 'test', note: null },
    ]);
  });

  it('estimates FTP per month up to the calendar end, with W/kg at the date of the effort', async () => {
    const P = performancePayload(await fixtureDataset());
    expect(P.months.map((m) => m.key)).toEqual(['2023-05', '2023-06', '2023-07', '2023-08', '2023-09', '2023-10', '2023-11', '2023-12',
      '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06']);
    expect(P.months[0]).toEqual({ key: '2023-05', eftp: 257, best20: 270, ftp: 240, weight: 72, wkg: 3.57 });
    expect(P.months.find((m) => m.key === '2024-04')).toEqual({ key: '2024-04', eftp: 266, best20: 280, ftp: 260, weight: 70, wkg: 3.8 });
    expect(P.current).toEqual({ eftp: 266, wkg: 3.8 });
    expect(P.peak).toEqual({ key: '2024-04', eftp: 266, wkg: 3.8 });
    expect(P.ctl.at(-1).date).toBe('2024-06-15');
  });

  it('compares all-time, last 90 days and last year; the ride that has not started yet does not count', async () => {
    const P = performancePayload(await fixtureDataset());
    expect(P.curves).toEqual({
      all: { 5: 850, 60: 400, 1200: 280, 3600: 250 },
      d90: { 5: 850, 60: 380, 1200: 280, 3600: 250 },
      ly: { 5: 800, 60: 400, 1200: 270 },
    });
    expect(P.curveWkg.ly).toEqual({ 5: 11.11, 60: 5.56, 1200: 3.75 });
    expect(P.profile.map((y) => y.year)).toEqual([2024, 2023]);
    expect(P.profile[0].vals.map((v) => v && [v.w, v.id, v.kg])).toEqual([[850, 'demo-0002', 70], [380, 'demo-0002', 70], null, [280, 'demo-0002', 70], [250, 'demo-0002', 70]]);
  });
});
