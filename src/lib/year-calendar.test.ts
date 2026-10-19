import { describe, expect, it } from 'vitest';
import { trainingCalendar } from '../training/index.ts';
import { yearCalendar } from './year-calendar.ts';
import type { YearCalendar } from './year-calendar.ts';
import { routes } from './routes.ts';

// Days, levels and streaks are tested on trainingCalendar (src/training/training-calendar.test.ts);
// this covers what the year review draws from it.
const ride = (id: number, d: Date, km: number, name = `Ride ${id}`) => ({ id, d, start: +d, distance: km * 1000, moving_time: 3600, name });
const rides = [
  ride(2, new Date(2025, 0, 1, 17), 30, 'Evening spin'),
  ride(1, new Date(2025, 0, 1, 9), 10),
  ride(3, new Date(2025, 5, 2, 8), 100),
];
const calendar = (today: Date) => yearCalendar(trainingCalendar(rides, { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31), today, measure: 'km' }), 2025);
const at = (C: YearCalendar, d: Date) => C.days[Math.round((+d - +new Date(2024, 11, 30)) / 86400000)];

describe('yearCalendar', () => {
  const C = calendar(new Date(2026, 1, 1));

  it('draws the weeks around the year; days of other years are empty', () => {
    expect(C.weeks).toBe(53);
    expect(C.days.slice(0, 2)).toEqual([null, null]);
    expect(C.days.slice(-4)).toEqual([null, null, null, null]);
    expect(C.days.filter(Boolean)).toHaveLength(365);
  });

  it('describes a ride day: kilometres, rides and names in order; a menu lists the rides, the cell links the most recent', () => {
    expect(at(C, new Date(2025, 0, 1))).toEqual({
      level: 1, title: 'Wed, 01/01/2025', detail: '2 rides · 40.0 km', notes: ['Ride 1', 'Evening spin'], href: routes.ride(2),
      rides: [
        { href: routes.ride(1), name: 'Ride 1', detail: '10.0 km' },
        { href: routes.ride(2), name: 'Evening spin', detail: '30.0 km' },
      ],
    });
    expect(at(C, new Date(2025, 5, 2))).not.toHaveProperty('rides');
    expect(at(C, new Date(2025, 0, 2))).toEqual({ level: 0, title: 'Thu, 02/01/2025', notes: ['Rest day'] });
  });

  it('labels each month above the week it starts in', () => {
    expect(C.months).toHaveLength(12);
    expect(C.months[0]).toEqual({ week: 0, label: 'Jan' });
    expect(C.months[11]).toEqual({ week: 48, label: 'Dec' });
  });

  it('leaves the days after the calendar end empty in the running year', () => {
    const now = calendar(new Date(2025, 5, 2, 12));
    expect(at(now, new Date(2025, 5, 2))).not.toBeNull();
    expect(at(now, new Date(2025, 5, 3))).toBeNull();
  });
});
