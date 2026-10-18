/**
 * The training calendar of the dashboard: D.heatmap (src/dashboard-period/history.js) turned into
 * the days, month labels and summary stats the TrainingCalendar component draws. Pure.
 */
import { fmtDur, nf, trunc, fmtWeekdayDate, fmtMonthShort } from '../../scripts/format.js';
import { t } from '../../i18n/index.js';
import { routes } from '../../lib/routes.js';

const hm = (key, x) => t('dash.heat.' + key, x);

/** One entry per cell (week by week, Monday first); null for days still to come. */
export function calendarDays(H) {
  return H.cells.map(({ d, rideDay, future, dim, level }) => {
    if (future) return null;
    const title = fmtWeekdayDate(d);
    if (!rideDay) return { level, dim, title, notes: [t('common.restDay')] };
    return {
      level, dim, title,
      detail: hm('tip', { rides: t('common.rides', { n: nf(rideDay.n) }), dur: fmtDur(rideDay.sec), load: nf(rideDay.load) }),
      notes: rideDay.names.map((n) => trunc(n, 40)),
      href: routes.ride(rideDay.id),
    };
  });
}

export const calendarMonths = (H) => H.months.map(({ week, d }) => ({ week, label: fmtMonthShort(d) }));

export const calendarStats = (H) => [
  { value: nf(H.activeDays), label: hm('activeDays') },
  { value: nf(H.longest), label: hm('longest') },
  { value: nf(H.current), label: hm('current') },
  { value: nf(H.weeks), label: hm('weeks') },
  { value: nf(H.hoursPerWeek, 1), label: hm('hoursWeek') },
];
