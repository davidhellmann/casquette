/**
 * The training calendar of the dashboard: D.heatmap (src/dashboard-period/history.ts) turned into
 * the days, month labels and summary stats the TrainingCalendar component draws. Pure.
 */
import { fmtDur, nf, trunc, fmtWeekdayDate, fmtMonthShort } from '../../scripts/format.ts';
import { t } from '../../i18n/index.ts';
import type { TParams } from '../../i18n/index.ts';
import { routes } from '../../lib/routes.ts';
import type { DashboardCalendar } from '../../dashboard-period/index.ts';
import type { CalendarDay } from '../charts/TrainingCalendar';

const hm = (key: string, x?: TParams) => t('dash.heat.' + key, x);

/** One entry per cell (week by week, Monday first); null for days still to come. */
export function calendarDays(H: Pick<DashboardCalendar, 'cells'>): (CalendarDay | null)[] {
  return H.cells.map(({ d, rideDay, future, dim, level }) => {
    if (future) return null;
    const title = fmtWeekdayDate(d);
    if (!rideDay) return { level, dim, title, notes: [t('common.restDay')] };
    return {
      level, dim, title,
      detail: hm('tip', { rides: t('common.rides', { n: nf(rideDay.n) }), dur: fmtDur(rideDay.sec), load: nf(rideDay.load) }),
      notes: rideDay.rides.slice(0, 3).map((r) => trunc(r.name, 40)),
      href: routes.ride(rideDay.id),
      ...(rideDay.n > 1 && {
        rides: rideDay.rides.map((r) => ({ href: routes.ride(r.id), name: r.name, detail: hm('rideTip', { dur: fmtDur(r.sec), load: nf(r.load) }) })),
      }),
    };
  });
}

export const calendarMonths = (H: Pick<DashboardCalendar, 'months'>): { week: number; label: string }[] => H.months.map(({ week, d }) => ({ week, label: fmtMonthShort(d) }));

export const calendarStats = (H: DashboardCalendar): { value: string; label: string }[] => [
  { value: nf(H.activeDays), label: hm('activeDays') },
  { value: nf(H.longest), label: hm('longest') },
  { value: nf(H.current), label: hm('current') },
  { value: nf(H.weeks), label: hm('weeks') },
  { value: nf(H.hoursPerWeek, 1), label: hm('hoursWeek') },
];
