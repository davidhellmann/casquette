import { ChartCard } from '@/components/app/ChartCard';
import { CalendarLegend, CalendarStats, TrainingCalendar } from '@/components/charts/TrainingCalendar';
import { t } from '@/i18n/index.ts';
import { calendarDays, calendarMonths, calendarStats } from './calendar-data.ts';

/** Training calendar of the last 52 weeks (colour = training load) – independent of the period. */
export function CalendarCard({ D }: { D: any }) {
  const H = D.heatmap;
  return (
    <ChartCard title={t('dash.sec.calendar')} description={t('dash.card.heatmapSub')}>
      <TrainingCalendar
        days={calendarDays(H)}
        weeks={H.cells.length / 7}
        months={calendarMonths(H)}
        weekdays={t('common.weekdaysShort')}
        label={t('dash.sec.calendar')}
      />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <CalendarStats items={calendarStats(H)} />
        <CalendarLegend less={t('common.less')} more={t('common.more')} />
      </div>
    </ChartCard>
  );
}
