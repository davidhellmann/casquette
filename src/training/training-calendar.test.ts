import { describe, expect, it } from 'vitest';
import { trainingCalendar, yearTotals } from './index.ts';
import type { TrainingCalendar } from './index.ts';

const ride = (id: string | number, d: Date, km: number, extra = {}) => ({ id, d, start: +d, distance: km * 1000, moving_time: 3600, h: 1, elev: 100, load: km, name: `Ride ${id}`, ...extra });
// 2025 starts on a Wednesday and ends on a Wednesday
const year = [
  ride(2, new Date(2025, 0, 1, 17), 30),
  ride(1, new Date(2025, 0, 1, 9), 10),
  ride(3, new Date(2025, 5, 2, 8), 100),
  ride(4, new Date(2025, 5, 3, 8), 5),
  ride(5, new Date(2025, 11, 31, 8), 60),
];
const of = <R>(C: TrainingCalendar<R>, y: number, m: number, d: number) => C.cells.find((c) => c.key === `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
const yearCal = (today = new Date(2026, 1, 1)) => trainingCalendar(year, { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31), today, measure: 'km' });

describe('trainingCalendar – grid', () => {
  it('runs week by week over the whole weeks around the range; days outside it are flagged', () => {
    const C = yearCal();
    expect(C.weeks).toBe(53);
    expect(C.cells).toHaveLength(53 * 7);
    expect(C.cells[0]).toMatchObject({ key: '2024-12-30', week: 0, outside: true });
    expect(C.cells.slice(0, 2).every((c) => c.outside)).toBe(true);
    expect(C.cells.slice(-4).every((c) => c.outside)).toBe(true);
    expect(C.cells.filter((c) => !c.outside)).toHaveLength(365);
    expect(C.cells.at(-1)).toMatchObject({ key: '2026-01-04', week: 52 });
  });

  it('marks the days after today as future and leaves their rides out', () => {
    const C = yearCal(new Date(2025, 5, 2, 12));
    expect(of(C, 2025, 5, 2)).toMatchObject({ future: false, level: expect.any(Number) });
    expect(of(C, 2025, 5, 3)).toMatchObject({ future: true, day: undefined, level: 0 });
    expect(C.cells.filter((c) => !c.outside && !c.future)).toHaveLength(153);
    expect(C.activeDays).toBe(2);
  });

  it('collects the rides of a day in chronological order with the summed measure', () => {
    const day = yearCal().days['2025-01-01'];
    expect(day.rides.map((r) => r.id)).toEqual([1, 2]);
    expect(day.latest.id).toBe(2); // a calendar cell opens the most recent ride of the day
    expect(day).toMatchObject({ n: 2, value: 40, sec: 7200 });
    const byLoad = trainingCalendar(year, { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31), measure: 'load' });
    expect(byLoad.days['2025-06-02'].value).toBe(100);
  });

  it('leaves out a ride without a valid ride date instead of giving it a day', () => {
    const rides = [ride('broken', new Date(NaN), 10, { start: +new Date(2025, 0, 6, 9) }), ride('ok', new Date(2025, 0, 6, 10), 10)];
    const C = trainingCalendar(rides, { from: new Date(2025, 0, 6), to: new Date(2025, 0, 12), measure: 'km' });
    expect(Object.keys(C.days)).toEqual(['2025-01-06']);
    expect(C.days['2025-01-06'].rides.map((r) => r.id)).toEqual(['ok']);
    expect(C.activeDays).toBe(1);
  });

  it('rejects an unknown measure', () => {
    // @ts-expect-error an unknown measure, as an untyped caller could pass it
    expect(() => trainingCalendar(year, { from: new Date(2025, 0, 1), to: new Date(2025, 0, 2), measure: 'hours' })).toThrow('measure');
  });
});

describe('trainingCalendar – levels', () => {
  it('colours ride days by the quartiles of the positive day values', () => {
    const C = yearCal(), level = (m: number, d: number) => of(C, 2025, m, d)?.level;
    expect([level(5, 3), level(0, 1), level(11, 31), level(5, 2), level(0, 2)]).toEqual([1, 2, 3, 4, 0]);
  });

  it('gives ride days without distance or load the lowest level and keeps them out of the quartiles', () => {
    const rides = [ride('a', new Date(2025, 0, 6), 0), ride('b', new Date(2025, 0, 7), 10), ride('c', new Date(2025, 0, 8), 20)];
    for (const measure of ['km', 'load'] as const) {
      const C = trainingCalendar(rides, { from: new Date(2025, 0, 6), to: new Date(2025, 0, 12), measure });
      expect(C.cells.map((c) => c.level)).toEqual([1, 1, 4, 0, 0, 0, 0]);
    }
    const zeros = trainingCalendar([rides[0]], { from: new Date(2025, 0, 6), to: new Date(2025, 0, 6), measure: 'load' });
    expect(zeros.cells[0].level).toBe(1);
  });
});

describe('trainingCalendar – streaks', () => {
  const at = (d: number) => ride(String(d), new Date(2025, 2, d, 10), 10);
  // March 2025: rides on 3–5, 10, 15–16; 1 March is a Saturday
  const rides = [3, 4, 5, 10, 15, 16].map(at);
  const cal = (to: Date, from = new Date(2025, 2, 1)) => trainingCalendar(rides, { from, to, measure: 'load' });

  it('finds the longest run of consecutive ride days within the range', () => {
    expect(cal(new Date(2025, 2, 31))).toMatchObject({ activeDays: 6, longestStreak: 3 });
    expect(cal(new Date(2025, 2, 31), new Date(2025, 2, 4))).toMatchObject({ activeDays: 5, longestStreak: 2 });
  });

  it('counts the current streak up to today, or up to yesterday while today has no ride yet', () => {
    expect(cal(new Date(2025, 2, 16)).currentStreak).toBe(2);
    expect(cal(new Date(2025, 2, 17)).currentStreak).toBe(2);
    expect(cal(new Date(2025, 2, 18)).currentStreak).toBe(0);
  });

  it('counts consecutive weeks with a ride up to this or last week', () => {
    expect(cal(new Date(2025, 2, 16)).weekStreak).toBe(2); // weeks from 3 and 10 March
    expect(cal(new Date(2025, 2, 20)).weekStreak).toBe(2); // this week empty so far
    expect(cal(new Date(2025, 2, 27)).weekStreak).toBe(0);
  });

  it('stays the same across a DST change', () => {
    const dst = [29, 30, 31].map((d) => ride(String(d), new Date(2025, 2, d, 10), 10));
    const C = trainingCalendar(dst, { from: new Date(2025, 2, 24), to: new Date(2025, 2, 31), measure: 'km' });
    expect(C).toMatchObject({ activeDays: 3, longestStreak: 3, currentStreak: 3 });
    expect(C.cells.map((c) => c.key).slice(-1)).toEqual(['2025-04-06']);
  });
});

describe('yearTotals', () => {
  it('sums rides, kilometres, hours and climbing per calendar year, oldest first', () => {
    expect(yearTotals([...year, ride(9, new Date(2023, 6, 1), 42)])).toEqual([
      { year: 2023, n: 1, km: 42, h: 1, elev: 100 },
      { year: 2025, n: 5, km: 205, h: 5, elev: 500 },
    ]);
    expect(yearTotals([])).toEqual([]);
  });
});
