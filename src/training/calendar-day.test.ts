// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import {
  addDays, calendarDate, calendarDay, dayOrdinal, daysBetween, isoWeek, ordinalDay, rideDate, sameDayLastYear,
  startOfDay, weekStart, yearDayIndex,
} from './index.ts';

const day = (s, time = '12:00:00') => new Date(`${s}T${time}`);

describe('calendar day – day keys and the ride date', () => {
  it('keeps the written local date of strings, even with Z or an offset', () => {
    expect(calendarDay('2024-06-02T00:30:00+14:00')).toBe('2024-06-02');
    expect(calendarDay('2024-06-01T23:30:00Z')).toBe('2024-06-01');
    expect(calendarDay('2024-02-29')).toBe('2024-02-29');
    expect(calendarDate('2024-02-29').getHours()).toBe(0);
  });
  it('uses the host-local components of a Date and rejects invalid input', () => {
    expect(calendarDay(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
    expect(calendarDay('garbage')).toBeNull();
    expect(calendarDay(undefined)).toBeNull();
  });
  it('takes the ride date from the written local start time', () => {
    expect(rideDate({ start_local: '2024-01-01T00:30:00+14:00', start: Date.parse('2023-12-31T10:30:00Z') })).toBe('2024-01-01');
  });
});

describe('calendar day – arithmetic counts calendar days, not 24-hour blocks', () => {
  // EU daylight saving: 31 March 2024 has 23 hours, 27 October 2024 has 25.
  it.each([['2024-03-30', '2024-04-01'], ['2024-10-26', '2024-10-28']])('steps over a DST change: %s → %s', (from, to) => {
    expect(calendarDay(addDays(day(from, '00:00:00'), 2))).toBe(to);
    expect(addDays(day(from, '00:00:00'), 2).getHours()).toBe(0);
    expect(daysBetween(day(from, '00:00:00'), day(to, '23:59:00'))).toBe(2);
    expect(dayOrdinal(to) - dayOrdinal(from)).toBe(2);
  });
  it('keeps the wall-clock time when adding days', () => {
    expect(addDays(new Date(2024, 2, 30, 18, 15), 1)).toEqual(new Date(2024, 2, 31, 18, 15));
  });
  it('crosses leap days and year boundaries', () => {
    expect(calendarDay(addDays(day('2024-02-28'), 1))).toBe('2024-02-29');
    expect(calendarDay(addDays(day('2023-02-28'), 1))).toBe('2023-03-01');
    expect(calendarDay(addDays(day('2023-12-31'), 1))).toBe('2024-01-01');
    expect(daysBetween(day('2024-01-01'), day('2025-01-01'))).toBe(366);
    expect(daysBetween('2025-01-01', '2024-12-31')).toBe(-1);
  });
  it('turns day ordinals back into day keys', () => {
    expect(ordinalDay(dayOrdinal('2024-02-29') + 1)).toBe('2024-03-01');
    expect(dayOrdinal(new Date(2024, 1, 29, 23, 59))).toBe(dayOrdinal('2024-02-29T08:00:00Z'));
    expect(dayOrdinal('garbage')).toBeNaN();
  });
  it('starts days at local midnight and weeks on Monday', () => {
    expect(startOfDay(new Date(2024, 2, 31, 15, 30))).toEqual(new Date(2024, 2, 31));
    expect(calendarDay(weekStart(day('2024-03-31')))).toBe('2024-03-25'); // Sunday → Monday before
    expect(calendarDay(weekStart(day('2024-03-25')))).toBe('2024-03-25');
    expect(calendarDay(weekStart(day('2025-01-01')))).toBe('2024-12-30');
    expect(weekStart(day('2024-10-30')).getHours()).toBe(0);
  });
  it.each([
    ['2024-12-30', 1], ['2025-01-01', 1], ['2021-01-03', 53], ['2021-01-04', 1], ['2026-12-31', 53], ['2024-06-03', 23],
  ])('numbers ISO weeks across year boundaries: %s → %i', (d, week) => {
    expect(isoWeek(day(d))).toBe(week);
  });
});

describe('calendar day – comparing years by date', () => {
  it('places every month and day on a leap reference year', () => {
    expect(yearDayIndex(day('2025-01-01'))).toBe(0);
    expect(yearDayIndex(day('2024-02-29'))).toBe(59);
    expect(yearDayIndex(day('2024-03-01'))).toBe(60);
    expect(yearDayIndex(day('2025-03-01'))).toBe(60);
    expect(yearDayIndex(day('2025-12-31'))).toBe(365);
  });
  it('finds the same date last year; 29 February becomes 28 February', () => {
    expect(sameDayLastYear(day('2025-03-01'))).toEqual(new Date(2024, 2, 1));
    expect(sameDayLastYear(day('2025-02-28'))).toEqual(new Date(2024, 1, 28));
    expect(sameDayLastYear(day('2024-02-29'))).toEqual(new Date(2023, 1, 28));
    expect(sameDayLastYear(day('2024-01-01'))).toEqual(new Date(2023, 0, 1));
  });
});
