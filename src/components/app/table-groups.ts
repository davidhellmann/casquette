import { isoWeek } from '@/scripts/format.js';

/** How a table with a time axis groups its rows. */
export type GroupBy = 'none' | 'week' | 'month';

export interface GroupKey {
  /** Stable id: `2025-W41` (ISO week) or `2025-10` (month). */
  key: string;
  /** ISO week-numbering year for weeks, calendar year for months. */
  year: number;
  /** ISO week number (1–53) or month index (0–11). */
  index: number;
}

export interface RowGroup<T> extends GroupKey {
  by: Exclude<GroupBy, 'none'>;
  rows: T[];
}

/** ISO week-numbering year: the year of the week's Thursday. */
const isoYear = (d: Date) => {
  const thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return thu.getFullYear();
};

/** The week (ISO, Monday–Sunday) or month a date belongs to, in local time. */
export function groupKey(d: Date, by: Exclude<GroupBy, 'none'>): GroupKey {
  if (by === 'week') {
    const year = isoYear(d), index = isoWeek(d);
    return { key: `${year}-W${index}`, year, index };
  }
  const year = d.getFullYear(), index = d.getMonth();
  return { key: `${year}-${String(index + 1).padStart(2, '0')}`, year, index };
}

/** Splits rows sorted by date into runs of the same week or month, keeping their order. */
export function groupRows<T>(rows: T[], dateOf: (row: T) => Date, by: Exclude<GroupBy, 'none'>): RowGroup<T>[] {
  const out: RowGroup<T>[] = [];
  for (const row of rows) {
    const k = groupKey(dateOf(row), by);
    const last = out[out.length - 1];
    if (last?.key === k.key) last.rows.push(row);
    else out.push({ ...k, by, rows: [row] });
  }
  return out;
}
