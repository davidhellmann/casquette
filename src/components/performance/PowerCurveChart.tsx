import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { curveLabel, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { hasValues, powerCurveData } from './performance-data.js';

type Row = ReturnType<typeof powerCurveData>[number];
type Curves = Record<'all' | 'd90' | 'ly', Record<string, number | null>>;

const value = (w: number | null, wkg: number | null) => (w == null ? '–' : `${nf(w)} W · ${nf(wkg, 2)} W/kg`);

/**
 * Best power over duration: all-time, last 90 days (area) and last year (dashed) – all monotone.
 * The year review passes its year as `d90` (label `recent`) and the year before as `ly`.
 */
export function PowerCurveChart({ curves, curveWkg, lastYear, recent, empty }: { curves: Curves; curveWkg: Curves; lastYear: number; recent?: string; empty?: string }) {
  const rows = powerCurveData({ curves, curveWkg });
  if (!rows.length || (recent && !hasValues(rows, 'd90'))) return <EmptyState>{empty ?? t('perf.chart.noPower')}</EmptyState>;
  const config = {
    all: { label: t('common.allTime'), color: SERIES.curveAllTime.color },
    d90: { label: recent ?? t('perf.chart.last90'), color: SERIES.curveRecent.color },
    ly: { label: String(lastYear), color: SERIES.curveCompare.color },
  } satisfies ChartConfig;
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const row = active && payload?.[0]?.payload;
    if (!row) return null;
    return (
      <TooltipBox title={curveLabel(row.s)} lines={[
        { label: config.all.label, color: config.all.color, value: value(row.all, row.allWkg) },
        { label: config.d90.label, color: config.d90.color, value: value(row.d90, row.d90Wkg) },
        { label: config.ly.label, color: config.ly.color, value: value(row.ly, row.lyWkg) },
      ]} />
    );
  };
  const ticks = niceTicks(0, Math.max(...rows.map((r) => r.all ?? 0)));
  const best = (s: number) => rows.find((r) => r.s === s);
  const summary = [300, 1200].map(best).filter(Boolean).map((r) => `${curveLabel(r!.s)}: ${value(r!.all, r!.allWkg)}`).join(', ');
  return (
    <>
      {summary && <p className="sr-only">{`${config.all.label} – ${summary}`}</p>}
      <SeriesLegend items={[
        { label: config.all.label, color: config.all.color },
        { label: config.d90.label, color: config.d90.color },
        { label: config.ly.label, color: config.ly.color, kind: 'dashed' },
      ]} />
      <ChartContainer config={config} className="aspect-auto min-h-[300px] w-full flex-1">
        <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-d90)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-d90)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="s" tickFormatter={curveLabel} tickLine={false} axisLine={false} minTickGap={16} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <Area dataKey="d90" type={SERIES.curveRecent.curve} stroke="var(--color-d90)" strokeWidth={2.25} fill="url(#fill-curve)" connectNulls dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          <Line dataKey="ly" type={SERIES.curveCompare.curve} stroke="var(--color-ly)" strokeWidth={1.5} strokeDasharray={SERIES.curveCompare.dash} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="all" type={SERIES.curveAllTime.curve} stroke="var(--color-all)" strokeWidth={1.75} connectNulls dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
