import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { curveLabel, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { rideCurveData } from './ride-data.ts';

type Row = ReturnType<typeof rideCurveData>[number];
type Curve = Record<string, number | null>;

export interface RideCurveProps {
  own: Curve;
  year: Curve;
  allTime: Curve;
  wkg: { own: Curve; year: Curve; allTime: Curve };
  yearLabel: number;
  ftp: number;
}

const value = (w: number | null, wkg: number | null) => (w == null ? '–' : `${nf(w)} W · ${nf(wkg, 2)} W/kg`);

/** The ride's power curve (area) against the bests of its year (dashed) and all-time, plus FTP – all monotone. */
export function RideCurveChart({ own, year, allTime, wkg, yearLabel, ftp }: RideCurveProps) {
  const rows = rideCurveData({ own, year, allTime, wkg });
  if (!rows.length) return <EmptyState>{t('common.noPowerData')}</EmptyState>;
  const config = {
    ride: { label: t('ride.thisRide'), color: SERIES.curveRide.color },
    year: { label: t('ride.best', { year: yearLabel }), color: SERIES.curveCompare.color },
    all: { label: t('common.allTime'), color: SERIES.curveAllTime.color },
    ftp: { label: 'FTP', color: SERIES.ftp.color },
  } satisfies ChartConfig;
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const row = active && payload?.[0]?.payload;
    if (!row) return null;
    return (
      <TooltipBox title={curveLabel(row.s)} lines={[
        { label: config.ride.label, color: config.ride.color, value: value(row.ride, row.rideWkg) },
        { label: config.year.label, color: config.year.color, value: value(row.year, row.yearWkg) },
        { label: config.all.label, color: config.all.color, value: value(row.all, row.allWkg) },
      ]} />
    );
  };
  const ticks = niceTicks(0, Math.max(ftp, ...rows.flatMap((r) => [r.ride, r.year ?? 0, r.all ?? 0])));
  const summary = rows.filter((r) => [60, 300, 1200].includes(r.s)).map((r) => `${curveLabel(r.s)}: ${value(r.ride, r.rideWkg)}`).join(', ');
  return (
    <>
      {summary && <p className="sr-only">{`${config.ride.label} – ${summary}`}</p>}
      <SeriesLegend items={[
        { label: config.ride.label, color: config.ride.color },
        { label: config.year.label, color: config.year.color, kind: 'dashed' },
        { label: config.all.label, color: config.all.color },
        { label: config.ftp.label, color: config.ftp.color, kind: 'dashed' },
      ]} />
      <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-ride-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ride)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-ride)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="s" tickFormatter={curveLabel} tickLine={false} axisLine={false} minTickGap={16} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <ReferenceLine y={ftp} stroke="var(--color-ftp)" strokeDasharray={SERIES.ftp.dash} strokeWidth={1.25} ifOverflow="extendDomain" />
          <Area dataKey="ride" type={SERIES.curveRide.curve} stroke="var(--color-ride)" strokeWidth={2.25} fill="url(#fill-ride-curve)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          <Line dataKey="year" type={SERIES.curveCompare.curve} stroke="var(--color-year)" strokeWidth={1.5} strokeDasharray={SERIES.curveCompare.dash} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="all" type={SERIES.curveAllTime.curve} stroke="var(--color-all)" strokeWidth={1.5} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
