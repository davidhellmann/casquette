import { describe, expect, it } from 'vitest';
import { yearCalendar } from './year-calendar.js';

const ride = (id, d, km, name = `Ride ${id}`) => ({ id, d, distance: km * 1000, name });
// 2025 starts on a Wednesday and ends on a Wednesday
const rides = [
  ride(1, new Date(2025, 0, 1, 9), 10),
  ride(2, new Date(2025, 0, 1, 17), 30, 'Evening spin'),
  ride(3, new Date(2025, 5, 2, 8), 100),
  ride(4, new Date(2025, 5, 3, 8), 5),
  ride(5, new Date(2025, 11, 31, 8), 60),
];
const at = (C, d) => C.days[Math.round((d - new Date(2024, 11, 30)) / 86400000)];

describe('yearCalendar', () => {
  const C = yearCalendar(rides, 2025, { base: '/casquette/', today: new Date(2026, 1, 1) });

  it('runs week by week from the Monday before 1 January to the Sunday after 31 December', () => {
    expect(C.weeks).toBe(53);
    expect(C.days).toHaveLength(53 * 7);
    // Mon/Tue before the year and Thu–Sun after it are no days of this year
    expect(C.days.slice(0, 2)).toEqual([null, null]);
    expect(C.days.slice(-4)).toEqual([null, null, null, null]);
    expect(C.days.filter(Boolean)).toHaveLength(365);
  });

  it('describes a ride day: kilometres, rides and names; it opens the (first) ride', () => {
    expect(at(C, new Date(2025, 0, 1))).toEqual({
      level: 2, title: 'Wed, 01/01/2025', detail: '2 rides · 40.0 km', notes: ['Ride 1', 'Evening spin'], href: '/casquette/rides/1',
    });
    expect(at(C, new Date(2025, 0, 2))).toEqual({ level: 0, title: 'Thu, 02/01/2025', notes: ['Rest day'] });
  });

  it('colours ride days by the quartiles of the year’s daily kilometres', () => {
    const level = (m, d) => at(C, new Date(2025, m, d)).level;
    expect([level(5, 3), level(0, 1), level(11, 31), level(5, 2)]).toEqual([1, 2, 3, 4]);
  });

  it('labels each month above the week it starts in', () => {
    expect(C.months).toHaveLength(12);
    expect(C.months[0]).toEqual({ week: 0, label: 'Jan' });
    expect(C.months[11]).toEqual({ week: 48, label: 'Dec' });
  });

  it('leaves the days after today empty in the running year', () => {
    const now = yearCalendar(rides, 2025, { base: '/', today: new Date(2025, 5, 2, 12) });
    expect(at(now, new Date(2025, 5, 2))).not.toBeNull();
    expect(at(now, new Date(2025, 5, 3))).toBeNull();
    expect(now.days.filter(Boolean)).toHaveLength(153);
  });
});
