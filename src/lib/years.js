/** Year reviews (server-side) over the build dataset (build-dataset.js). */
import { totals } from './build-dataset.js';
import { bestCurve, calendarDay, records, sameDayLastYear, trainingCalendar, weekStart } from '../training/index.js';
import { tizTotal } from '../ride/index.js';
import { t } from '../i18n/index.js';

export const MONTHS = t('common.monthsShort');
export const MONTHS_L = t('common.monthsLong');
export const WEEKDAYS = t('common.weekdaysLong');

/** Years with stat rides, newest first. */
export function yearList(data) {
  return Array.from(new Set(data.calendar.statRides.map((r) => r.year))).sort((a, b) => b - a);
}

/**
 * One year of stat rides. The running year is the year of the calendar end: it counts up to the calendar
 * end and compares with the previous year up to the same date (year to date).
 */
export function yearData(data, year) {
  const { statRides: all, end } = data.calendar;
  const rides = all.filter((r) => r.year === year);
  const prev = all.filter((r) => r.year === year - 1);
  const t = totals(rides), tp = totals(prev);
  const isCurrent = year === end.getFullYear();
  // Athlete state at year end (running year: today) – for the FTP line, not for TIZ boundaries
  const athleteState = isCurrent ? data.athleteToday : data.athleteAt(new Date(year, 11, 31));
  // Previous year up to the same date (for fair comparisons in the running year)
  const lastYearCut = calendarDay(sameDayLastYear(end));
  const tpYtd = isCurrent ? totals(prev.filter((r) => calendarDay(r.d) <= lastYearCut)) : tp;

  const months = MONTHS.map((_, m) => {
    const rs = rides.filter((r) => r.month === m);
    const tt = totals(rs);
    const wR = rs.filter((r) => r.w != null);
    const wT = wR.reduce((s, r) => s + r.moving_time, 0);
    return {
      m, rides: rs, t: tt,
      prevKm: prev.filter((r) => r.month === m).reduce((s, r) => s + r.distance / 1000, 0),
      avgW: wT ? wR.reduce((s, r) => s + r.w * r.moving_time, 0) / wT : null,
      tiz: tizTotal(rs, 'power'), longest: records(rs).longest,
    };
  });

  // Weeks & streaks
  const weekKm = {};
  rides.forEach((r) => { const k = calendarDay(weekStart(r.d)); weekKm[k] = (weekKm[k] || 0) + r.distance / 1000; });
  const bestWeekK = Object.entries(weekKm).sort((a, b) => b[1] - a[1])[0];
  const calendar = trainingCalendar(rides, { from: new Date(year, 0, 1), to: new Date(year, 11, 31), today: end, measure: 'km' });
  const wd = Array(7).fill(0); rides.forEach((r) => wd[(r.d.getDay() + 6) % 7]++);
  const favWd = wd.indexOf(Math.max(...wd));
  const hours = rides.map((r) => r.d.getHours() + r.d.getMinutes() / 60);

  // Bikes
  const gear = data.gear;
  const byGear = {};
  rides.forEach((r) => { if (r.gear_id) byGear[r.gear_id] = (byGear[r.gear_id] || 0) + r.distance / 1000; });
  const bikes = Object.entries(byGear).map(([id, km]) => ({ id, km, name: (gear.find((g) => g.id === id) || {}).name || id, n: rides.filter((r) => r.gear_id === id).length })).sort((a, b) => b.km - a.km);

  const best = records(rides);
  const highlights = {
    longest: best.longest, climb: best.climb, fastest: best.fastest, np: best.np, hardest: best.load, prs: best.prs,
    earliest: rides.length ? rides.reduce((a, b) => ((a.d.getHours() * 60 + a.d.getMinutes()) <= (b.d.getHours() * 60 + b.d.getMinutes()) ? a : b)) : null,
    first: rides[rides.length - 1] || null,
    last: rides[0] || null,
  };

  return {
    year, isCurrent, athleteState, rides, prev, t, tp, tpYtd, months,
    bestMonth: months.slice().sort((a, b) => b.t.km - a.t.km)[0],
    bestWeek: bestWeekK ? { start: new Date(bestWeekK[0]), km: bestWeekK[1] } : null,
    calendar, streak: calendar.longestStreak, favWd, wd, activeDays: calendar.activeDays,
    avgStart: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    bikes, highlights,
    curve: bestCurve(rides), curveAll: bestCurve(all), curvePrev: bestCurve(prev),
    tiz: tizTotal(rides, 'power'),
  };
}
