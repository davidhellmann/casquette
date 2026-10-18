// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * The training calendar of a year review as the TrainingCalendar component draws it: one cell per day
 * from the Monday before 1 January to the Sunday after 31 December. Days, levels and streaks come
 * from `trainingCalendar` (src/training/training-calendar.ts, measure 'km'); this only adds text and links.
 */
import { daysBetween, weekStart } from '../training/index.ts';
import { routes } from './routes.ts';
import { nf, trunc, fmtWeekdayDate, fmtMonthShort } from '../scripts/format.ts';
import { t } from '../i18n/index.ts';

/**
 * @param calendar `trainingCalendar(rides, { from: 1 Jan, to: 31 Dec, today: calendar end, measure: 'km' })`
 * @returns {{ days: (object|null)[], weeks: number, months: { week: number, label: string }[] }}
 */
export function yearCalendar(calendar, year) {
  const days = calendar.cells.map(({ d, day, level, outside, future }) => {
    if (outside || future) return null;
    const title = fmtWeekdayDate(d);
    if (!day) return { level: 0, title, notes: [t('common.restDay')] };
    return {
      level,
      title,
      detail: t('year.calTip', { rides: t('common.rides', { n: nf(day.n) }), km: nf(day.value, 1) }),
      notes: day.rides.map((r) => trunc(r.name, 40)),
      href: routes.ride(day.latest.id),
      ...(day.n > 1 && {
        rides: day.rides.map((r) => ({ href: routes.ride(r.id), name: r.name, detail: t('year.calRideTip', { km: nf((r.distance || 0) / 1000, 1) }) })),
      }),
    };
  });
  const start = weekStart(new Date(year, 0, 1));
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year, m, 1);
    return { week: Math.floor(daysBetween(start, first) / 7), label: fmtMonthShort(first) };
  });
  return { days, weeks: calendar.weeks, months };
}
