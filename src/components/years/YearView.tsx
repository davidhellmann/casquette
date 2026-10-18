import * as React from 'react';
import { CardLabel } from '@/components/app/CardLabel';
import { ChartCard } from '@/components/app/ChartCard';
import { DataTable } from '@/components/app/DataTable';
import { DeltaBadge } from '@/components/app/DeltaBadge';
import { KpiCard } from '@/components/app/KpiCard';
import { CalendarLegend, CalendarStats, TrainingCalendar, type CalendarDay } from '@/components/charts/TrainingCalendar';
import type { SeriesKey } from '@/components/charts/series';
import { PowerCurveChart } from '@/components/performance/PowerCurveChart';
import type { RideColumnId, RideRow } from '@/components/rides/ride-columns';
import { RideList } from '@/components/rides/RideList';
import { TooltipProvider } from '@/components/ui/tooltip';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { IntensityChart } from './IntensityChart';
import { MonthsChart } from './MonthsChart';
import { TimeInZones } from '@/components/charts/ZoneBars';
import { Bikes, Glance, Highlights, type GlanceItem, type Highlight, type YearBike } from './year-parts';
import { monthColumns } from './year-tables';
import { useIslandReady } from '@/lib/island-ready';

/** One month of the year review (src/lib/year-payload.js). */
export interface YearMonth {
  m: number;
  label: string;
  long: string;
  n: number;
  km: number;
  h: number;
  elev: number;
  tss: number;
  prevKm: number;
  avgW: number | null;
  /** Share of time per power zone in percent; null without zone data. */
  zones: number[] | null;
  longest: { href: string; name: string; km: number } | null;
  /** The month with the most kilometres. */
  best: boolean;
}

interface YearKpi {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  /** Change vs. the year before (up to the same day in the running year); absent = no comparison. */
  pct?: number | null;
  tip: string;
  secondary: string;
  spark?: number[];
  series: SeriesKey;
  fromZero?: boolean;
}

type Curves = Record<'all' | 'd90' | 'ly', Record<string, number | null>>;

/** Build payload of /years/<year> (src/lib/year-payload.js). */
export interface YearPayload {
  year: number;
  isCurrent: boolean;
  base: string;
  kpis: YearKpi[];
  months: YearMonth[];
  glance: GlanceItem[];
  highlights: Highlight[];
  calendar: { days: (CalendarDay | null)[]; weeks: number; months: { week: number; label: string }[] };
  calendarStats: { value: string; label: string }[];
  /** Seconds per power zone over the year (legacy/historical zones, no common boundaries). */
  tizP: number[] | null;
  /** Shown when the year's rides don't share one set of zone boundaries (legacy or changed zones). */
  tizNote: string | null;
  zoneNames: string[];
  /** This year as `d90`, the year before as `ly`. */
  curves: Curves;
  curveWkg: Curves;
  bikes: YearBike[];
  /** Newest first (rideRows in src/components/rides/ride-list.js). */
  rides: RideRow[];
}

const yt = (key: string, p?: Record<string, unknown>) => t(`year.${key}`, p);
const getMonthId = (m: YearMonth) => String(m.m);
const TOP_COLUMNS: RideColumnId[] = ['date', 'name', 'km', 'time', 'elev', 'np', 'tss'];
const ALL_COLUMNS: RideColumnId[] = ['date', 'name', 'km', 'time', 'elev', 'w', 'np', 'hr', 'tss'];

/** Year review (new UI): key figures, months, calendar, intensity, power curve, highlights and rides of one year. */
export function YearView({ P }: { P: YearPayload }) {
  useIslandReady();
  const { year } = P;
  const rides = P.rides;
  const top10 = React.useMemo(() => rides.slice().sort((a, b) => b.km - a.km).slice(0, 10), [rides]);
  const months = React.useMemo(() => monthColumns(Math.max(1, ...P.months.map((m) => m.km))), [P.months]);
  const half = 'grid lg:col-span-6 xl:col-span-7';
  const rest = 'grid lg:col-span-6 xl:col-span-5';
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-3 pb-8" data-testid="year-review">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pt-1">
          <div>
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">{yt('tag')}{P.isCurrent ? yt('tagToDate') : ''}</p>
            <h1 className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{year}</h1>
          </div>
        </header>

        <h2 className="sr-only">{yt('keyFigures')}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="year-kpis">
          {P.kpis.map(({ key, pct, tip, ...k }) => (
            <KpiCard
              key={key}
              {...k}
              delta={pct !== undefined ? <DeltaBadge pct={pct} tip={pct == null ? yt('noPrev', { y: year - 1 }) : tip} /> : undefined}
            />
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className="grid lg:col-span-8" data-testid="months-chart">
            <ChartCard title={yt('monthByMonth')} description={yt('monthByMonthSub', { y: year - 1 })}>
              <MonthsChart months={P.months} year={year} />
            </ChartCard>
          </div>
          <div className="grid lg:col-span-4">
            <ChartCard title={yt('glance')}>
              <Glance items={P.glance} />
            </ChartCard>
          </div>
        </div>

        <ChartCard title={yt('calendar')} description={yt('calendarSub')}>
          <TrainingCalendar
            days={P.calendar.days}
            weeks={P.calendar.weeks}
            months={P.calendar.months}
            weekdays={t('common.weekdaysShort')}
            label={yt('calendarLabel', { y: year })}
          />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <CalendarStats items={P.calendarStats} />
            <CalendarLegend less={t('common.less')} more={t('common.more')} />
          </div>
        </ChartCard>

        <ChartCard title={yt('months')}>
          <DataTable label={yt('months')} columns={months} data={P.months} getRowId={getMonthId} pageSize={false} empty={t('common.noData')} />
        </ChartCard>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className={half} data-testid="intensity-chart">
            <ChartCard title={yt('intensity')} description={yt('intensitySub')}>
              <IntensityChart months={P.months} zoneNames={P.zoneNames} year={year} />
            </ChartCard>
          </div>
          <div className={rest}>
            <ChartCard title={yt('tizYear')} description={yt('tizYearSub')}>
              {P.tizNote && <p className="mb-3 text-xs text-muted-foreground">{P.tizNote}</p>}
              <TimeInZones seconds={P.tizP} zones={null} kind="power" />
            </ChartCard>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-12">
          <div className={`${half} [&_[data-slot=card-content]]:flex [&_[data-slot=card-content]]:flex-1 [&_[data-slot=card-content]]:flex-col`} data-testid="power-curve-chart">
            <ChartCard title={t('dash.card.curve')} description={yt('curveSub', { y: year, py: year - 1 })}>
              <PowerCurveChart curves={P.curves} curveWkg={P.curveWkg} lastYear={year - 1} recent={String(year)} empty={yt('noPowerYear')} />
            </ChartCard>
          </div>
          <div className={rest}>
            <ChartCard title={yt('bikes')}>
              <Bikes bikes={P.bikes} />
            </ChartCard>
          </div>
        </div>

        <section className="grid gap-3 pt-3" aria-labelledby="year-highlights">
          <div>
            <CardLabel as="h2" className="mb-1"><span id="year-highlights">{yt('highlights')}</span></CardLabel>
            <p className="text-xs text-muted-foreground">{yt('highlightsSub', { y: year })}</p>
          </div>
          <Highlights items={P.highlights} />
        </section>

        <ChartCard title={yt('top10')} description={yt('top10Sub')}>
          <RideList label={yt('top10')} rides={top10} columns={TOP_COLUMNS} sort="km" pageSize={false} group={null} empty={t('common.noRides')} />
        </ChartCard>

        <ChartCard title={yt('allRides')} description={yt('allRidesSub', { rides: t('common.rides', { n: nf(rides.length) }), y: year })}>
          <RideList
            label={yt('allRides')}
            rides={rides}
            columns={ALL_COLUMNS}
            search
            pageSize={10}
            storageId="year-rides"
            empty={t('common.noRidesFound')}
            summary
          />
        </ChartCard>
      </div>
    </TooltipProvider>
  );
}
