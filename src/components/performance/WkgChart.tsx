import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { monthLabel, monthTick, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { hasValues, wkgChartData } from './performance-data.ts';
import type { PerformanceMonth } from './PerformanceView';

type Row = ReturnType<typeof wkgChartData>[number];

const config = {
  wkg: { label: t('perf.chart.wkg'), color: SERIES.wkg.color },
  weight: { label: t('perf.chart.weight'), color: SERIES.weight.color },
} satisfies ChartConfig;

const fmtWkg = (v: number | null) => (v == null ? '–' : `${nf(v, 2)} W/kg`);
const fmtKg = (v: number | null) => (v == null ? '–' : `${nf(v, 1)} kg`);
const range = (vs: (number | null)[]) => {
  const xs = vs.filter((v): v is number => v != null);
  return xs.length ? niceTicks(Math.min(...xs), Math.max(...xs), 4) : [];
};

function WkgTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active && payload?.[0]?.payload;
  if (!row) return null;
  return (
    <TooltipBox title={monthLabel(row.key)} lines={[
      { label: config.wkg.label, color: config.wkg.color, value: fmtWkg(row.wkg) },
      { label: config.weight.label, color: config.weight.color, value: fmtKg(row.weight) },
    ]} />
  );
}

/** eFTP per kg (smooth area, left axis) and body weight (step, right axis) per month. */
export function WkgChart({ months }: { months: PerformanceMonth[] }) {
  const rows = wkgChartData(months);
  if (!hasValues(rows, 'wkg')) return <EmptyState>{t('perf.chart.noData')}</EmptyState>;
  const wTicks = range(rows.map((r) => r.wkg));
  const kgTicks = range(rows.map((r) => r.weight));
  const last = rows.filter((r) => r.wkg != null).at(-1)!;
  return (
    <>
      <p className="sr-only">{`${config.wkg.label} ${fmtWkg(last.wkg)}, ${config.weight.label} ${fmtKg(last.weight)}`}</p>
      <SeriesLegend items={[
        { label: config.wkg.label, color: config.wkg.color },
        { label: config.weight.label, color: config.weight.color },
      ]} />
      <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-wkg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-wkg)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-wkg)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="key" tickFormatter={monthTick} tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
          <YAxis yAxisId="wkg" tickLine={false} axisLine={false} width={44} ticks={wTicks} domain={[wTicks[0], wTicks.at(-1)!]} tickFormatter={(v) => nf(v, 1)} />
          {kgTicks.length > 0 && (
            <YAxis yAxisId="kg" orientation="right" tickLine={false} axisLine={false} width={36} ticks={kgTicks} domain={[kgTicks[0], kgTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          )}
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<WkgTooltip />} />
          <Area yAxisId="wkg" dataKey="wkg" type={SERIES.wkg.curve} stroke="var(--color-wkg)" strokeWidth={2.25} fill="url(#fill-wkg)" baseValue={wTicks[0]} connectNulls dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          {kgTicks.length > 0 && (
            <Line yAxisId="kg" dataKey="weight" type={SERIES.weight.curve} stroke="var(--color-weight)" strokeWidth={1.5} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
