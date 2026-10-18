import { describe, expect, it } from 'vitest';
import { calendarDays, calendarMonths, calendarStats } from './calendar-data.js';
import { routes } from '../../lib/routes.js';

// A hand-made D.heatmap (shape from src/dashboard-period/history.js): one ride day, one rest day, one future day.
const ride = { load: 87.4, sec: 8100, n: 2, names: ['Morning Ride', 'A very long ride name that keeps going and going on'], id: 42 };
const H = {
  cells: [
    { d: new Date(2025, 2, 3), week: 0, rideDay: ride, future: false, dim: false, level: 3 },
    { d: new Date(2025, 2, 4), week: 0, rideDay: undefined, future: false, dim: true, level: 0 },
    { d: new Date(2025, 2, 5), week: 0, rideDay: undefined, future: true, dim: false, level: 0 },
  ],
  months: [{ week: 0, d: new Date(2025, 2, 3) }, { week: 5, d: new Date(2025, 3, 7) }],
  activeDays: 1, longest: 1, current: 0, weeks: 1, hoursPerWeek: 8100 / 3600 / 52,
};

describe('calendarDays', () => {
  it('describes a ride day like the tooltip: date, rides · duration · load, names; it opens the ride', () => {
    expect(calendarDays(H)[0]).toEqual({
      level: 3,
      dim: false,
      title: 'Mon, 03/03/2025',
      detail: '2 rides · 2:15 h · load 87',
      notes: ['Morning Ride', 'A very long ride name that keeps going …'],
      href: routes.ride(42),
    });
  });
  it('marks a day without rides as a rest day', () => {
    expect(calendarDays(H)[1]).toEqual({ level: 0, dim: true, title: 'Tue, 04/03/2025', notes: ['Rest day'] });
  });
  it('leaves future days empty', () => {
    expect(calendarDays(H)[2]).toBeNull();
  });
});

it('labels the months with their short name at the week they start', () => {
  expect(calendarMonths(H)).toEqual([{ week: 0, label: 'Mar' }, { week: 5, label: 'Apr' }]);
});

it('lists the summary stats', () => {
  expect(calendarStats(H)).toEqual([
    { value: '1', label: 'active days' },
    { value: '1', label: 'longest streak (days)' },
    { value: '0', label: 'current streak' },
    { value: '1', label: 'consecutive weeks with a ride' },
    { value: '0.0', label: 'avg hours / week' },
  ]);
});
