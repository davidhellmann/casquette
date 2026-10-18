import { describe, expect, it } from 'vitest';
import { groupKey, groupRows } from './table-groups';

const d = (s: string) => new Date(`${s}T10:00:00`);

describe('groupKey', () => {
  it('uses the ISO week and its ISO year', () => {
    expect(groupKey(d('2025-10-08'), 'week')).toEqual({ key: '2025-W41', year: 2025, index: 41 });
    // Monday 30 Dec 2024 belongs to week 1 of 2025, Sunday 3 Jan 2021 to week 53 of 2020
    expect(groupKey(d('2024-12-30'), 'week')).toEqual({ key: '2025-W1', year: 2025, index: 1 });
    expect(groupKey(d('2021-01-03'), 'week')).toEqual({ key: '2020-W53', year: 2020, index: 53 });
  });

  it('weeks run Monday to Sunday', () => {
    expect(groupKey(d('2025-10-06'), 'week').key).toBe(groupKey(d('2025-10-12'), 'week').key);
    expect(groupKey(d('2025-10-13'), 'week').key).not.toBe(groupKey(d('2025-10-12'), 'week').key);
  });

  it('uses the calendar month', () => {
    expect(groupKey(d('2025-10-31'), 'month')).toEqual({ key: '2025-10', year: 2025, index: 9 });
    expect(groupKey(d('2025-11-01'), 'month').key).toBe('2025-11');
  });
});

describe('groupRows', () => {
  const rides = ['2025-10-13', '2025-10-12', '2025-10-06', '2025-10-05', '2025-09-30'].map((s, i) => ({ i, date: d(s) }));

  it('keeps the row order and starts a group where the key changes', () => {
    const groups = groupRows(rides, (r) => r.date, 'week');
    expect(groups.map((g) => g.key)).toEqual(['2025-W42', '2025-W41', '2025-W40']);
    expect(groups.map((g) => g.rows.map((r) => r.i))).toEqual([[0], [1, 2], [3, 4]]);
    expect(groups[1]).toMatchObject({ by: 'week', year: 2025, index: 41 });
  });

  it('groups by month in either sort direction', () => {
    const asc = rides.slice().reverse();
    expect(groupRows(asc, (r) => r.date, 'month').map((g) => [g.key, g.rows.length])).toEqual([['2025-09', 1], ['2025-10', 4]]);
  });

  it('has no groups without rows', () => {
    expect(groupRows([], (r: { date: Date }) => r.date, 'week')).toEqual([]);
  });
});
