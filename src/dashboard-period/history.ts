/** History and training calendar of a dashboard period: all-time results, independent of the period. Pure. */
import { calendarDay, records, sameDayLastYear, trainingCalendar, yearDayIndex, yearTotals } from '../training/index.ts';
import type { TrainingCalendarLevel, YearTotal } from '../training/index.ts';
import type { PeriodBounds, PeriodDays, PeriodRide } from './index.ts';

/** Totals of one calendar year (`y` = the year). */
export type HistoryYear = Omit<YearTotal, 'year'> & { y: number };

/** Cumulative kilometres of one year on the 366 days of a leap reference year; null after today in the running year. */
export interface CumulativeYear {
  y: number;
  data: (number | null)[];
}

/** All-time history: years, year to date and cumulative kilometres. */
export interface PeriodHistory<R> {
  history: {
    /** Year totals, oldest first. */
    years: HistoryYear[];
    km: number;
    /** Hours. */
    h: number;
    elev: number;
    /** Longest stat ride of all time. */
    longest: R | null;
    /** The year with the most kilometres. */
    best: HistoryYear | null;
    /** The running year (year of the calendar end). */
    cy: number;
    /** Stat rides in more than one year. */
    multiYear: boolean;
    /** Up to the last six years, newest first. */
    cumulative: CumulativeYear[];
    /** The 366 days of the leap reference year 2024 (labels of `cumulative`). */
    labels: Date[];
    /** Year to date (km) and the previous year up to the same date. */
    ytdNow: number;
    ytdPrev: number;
    /** Change of the year to date in %, null without a previous year. */
    ytdDelta: number | null;
  };
  heatmap: DashboardCalendar;
}

/** A ride of a training calendar day. */
export interface DashboardCalendarRide {
  id: string;
  name: string;
  /** Moving time in seconds. */
  sec: number;
  load: number;
}

/** A ride day of the dashboard's training calendar. */
export interface DashboardCalendarDay {
  load: number;
  sec: number;
  /** Number of rides. */
  n: number;
  /** Id of the day's latest ride (the link of a day with one ride). */
  id: string;
  /** The day's rides in chronological order. */
  rides: DashboardCalendarRide[];
}

/** A day of the dashboard's training calendar grid. */
export interface DashboardCalendarCell {
  d: Date;
  /** Week index from 0. */
  week: number;
  rideDay: DashboardCalendarDay | undefined;
  future: boolean;
  /** Before the selected period (only for periods shorter than a year). */
  dim: boolean;
  level: TrainingCalendarLevel;
}

/** The dashboard's training calendar (code name `heatmap`): 53 weeks up to the calendar end, by load. */
export interface DashboardCalendar {
  /** Ride days by calendar day 'YYYY-MM-DD'. */
  day: Record<string, DashboardCalendarDay>;
  cells: DashboardCalendarCell[];
  /** Month labels: the first week of each month. */
  months: { week: number; d: Date }[];
  activeDays: number;
  /** Longest and current streak of ride days, streak of weeks. */
  longest: number;
  current: number;
  weeks: number;
  /** Average hours per week over 52 weeks. */
  hoursPerWeek: number;
}

export function history<R extends PeriodRide>(D: PeriodBounds<R>, selectedDays: PeriodDays): PeriodHistory<R> {
  const R = D.ridesAll, end = D.calendarEnd, cy = end.getFullYear(), td = yearDayIndex(end);
  let meters = 0, h = 0, elev = 0;
  for (const r of R) { meters += r.distance || 0; h += r.h; elev += r.elev || 0; }
  const years: HistoryYear[] = yearTotals(R).map(({ year, ...totals }) => ({ y: year, ...totals }));
  // Year to date, compared with the previous year up to the same date (see sameDayLastYear).
  const km = (rides: R[]) => rides.reduce((s,r) => s + (r.distance || 0),0) / 1000;
  const ytdNow = km(R.filter(r => r.d.getFullYear() === cy));
  // `end` is a valid date by construction.
  const lastYearCut = calendarDay(sameDayLastYear(end)) ?? '';
  const ytdPrev = km(R.filter(r => { const day = calendarDay(r.d); return r.d.getFullYear() === cy - 1 && day !== null && day <= lastYearCut; }));
  // Cumulative kilometres on a leap reference year (labels), each ride on its month and day.
  const cumulative = years.slice(-6).reverse().map(({y}) => {
    const daily: number[] = Array(366).fill(0);
    for (const r of R) if (r.d.getFullYear() === y) daily[yearDayIndex(r.d)] += (r.distance || 0) / 1000;
    let acc = 0;
    return { y, data: daily.map((v,i) => { acc += v; return y === cy && i > td ? null : Math.round(acc); }) };
  });
  const historyResult = { years, km: meters / 1000, h, elev, longest: records(R).longest, best: years.slice().sort((a,b) => b.km-a.km)[0] ?? null,
    cy, multiYear: !!R.length && D.oldest.getFullYear() < cy, cumulative,
    labels: Array.from({length:366}, (_,i) => new Date(2024,0,1+i)), ytdNow, ytdPrev,
    ytdDelta: ytdPrev ? (ytdNow-ytdPrev)/ytdPrev*100 : null };

  const C = trainingCalendar(R, { from: D.heatStart, to: end, measure: 'load' });
  const day: Record<string, DashboardCalendarDay> = Object.fromEntries(Object.entries(C.days).map(([key, o]) =>
    [key, { load: o.value, sec: o.sec, n: o.n, id: o.latest.id,
      rides: o.rides.map(r => ({ id: r.id, name: r.name, sec: r.moving_time || 0, load: r.load || 0 })) }]));
  const cells: DashboardCalendarCell[] = C.cells.map(({ d, week, key, level, future }) => ({ d, week, rideDay: day[key], future,
    dim: selectedDays !== 0 && D.days < 365 && d < D.periodStart, level }));
  const months: { week: number; d: Date }[] = []; let lastM = -1;
  for (let w = 0; w < C.weeks; w++) {
    const wd = cells[w * 7].d;
    if (wd.getMonth() !== lastM) { if (w < 51) months.push({ week: w, d: wd }); lastM = wd.getMonth(); }
  }
  return { history: historyResult, heatmap: { day, cells, months, activeDays: C.activeDays, longest: C.longestStreak, current: C.currentStreak, weeks: C.weekStreak,
    hoursPerWeek: Object.values(day).reduce((s,o)=>s+o.sec,0)/3600/52 } };
}
