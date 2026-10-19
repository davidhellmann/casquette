import { describe, expect, it } from 'vitest';
import { demoDayShift, shiftDay, shiftHistory, shiftInstant, shiftRideDates, shiftZonesFile } from './demo-clock.ts';

// 2026-10-17 is a Saturday.
const today = new Date(2026, 9, 17, 15, 30);

describe('demoDayShift – keeps the shipped demo data current', () => {
  it('moves the newest demo ride into the last seven days, in whole weeks', () => {
    expect(demoDayShift('2026-10-10', today)).toBe(7);
    expect(demoDayShift('2026-09-01', today)).toBe(42); // Tue 2026-10-13
    expect(demoDayShift('2025-10-18', today)).toBe(364);
  });

  it('does not shift data whose newest ride is already within the last week', () => {
    expect(demoDayShift('2026-10-11', today)).toBe(0);
    expect(demoDayShift('2026-10-17', today)).toBe(0);
  });

  it('never moves data backwards, even if the newest ride lies in the future', () => {
    expect(demoDayShift('2026-11-02', today)).toBe(0);
  });

  it('does not shift without a known newest day', () => {
    expect(demoDayShift(null, today)).toBe(0);
    expect(demoDayShift('garbage', today)).toBe(0);
  });
});

describe('shifting dates', () => {
  it('shifts a calendar day', () => {
    expect(shiftDay('2024-02-26', 7)).toBe('2024-03-04');
  });

  it('shifts the start instant and the local start time of a ride by whole days', () => {
    const ride = { id: '1', name: 'Loop', start_date: '2026-03-27T06:15:00Z', start_date_local: '2026-03-27T07:15:00' };
    expect(shiftRideDates(ride, 14)).toEqual({ id: '1', name: 'Loop', start_date: '2026-04-10T06:15:00Z', start_date_local: '2026-04-10T07:15:00' });
    expect(ride.start_date_local).toBe('2026-03-27T07:15:00');
  });

  it('returns the ride unchanged for a zero shift', () => {
    const ride = { id: '1', start_date_local: '2026-03-27T07:15:00' };
    expect(shiftRideDates(ride, 0)).toBe(ride);
  });
});

describe('shiftInstant / shiftHistory – sync time and athlete history move with the demo rides', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  it('moves an instant by whole days but never past now', () => {
    expect(shiftInstant('2026-10-01T06:00:00.000Z', 7, now)).toBe('2026-10-08T06:00:00.000Z');
    expect(shiftInstant('2026-10-15T06:00:00.000Z', 7, now)).toBe('2026-10-17T12:00:00.000Z');
    expect(shiftInstant(null, 7, now)).toBe(null);
  });

  it('moves every dated history entry by the shift', () => {
    const history = [{ date: '2024-01-01', ftp: 250 }, { ftp: 260 }];
    expect(shiftHistory(history, 14)).toEqual([{ date: '2024-01-15', ftp: 250 }, { ftp: 260 }]);
    expect(shiftHistory(history, 0)).toBe(history);
  });

  it('moves the dates of the demo zones file, keeping undated entries and power bounds', () => {
    const file = { heart_rate: [{ from: '2024-01-01', bpm: [0, 1, 2, 3, 4] }, { bpm: [0, 5, 6, 7, 8] }], power: { ftp_percent: [0, 55] } };
    expect(shiftZonesFile(file, 14)).toEqual({ heart_rate: [{ from: '2024-01-15', bpm: [0, 1, 2, 3, 4] }, { bpm: [0, 5, 6, 7, 8] }], power: { ftp_percent: [0, 55] } });
    expect(shiftZonesFile(file, 0)).toBe(file);
    expect(shiftZonesFile(null, 14)).toBe(null);
  });
});
