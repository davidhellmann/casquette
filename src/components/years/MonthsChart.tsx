import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { SERIES, barRadius, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import type { YearMonth } from './YearView';

/** Kilometres per month (rounded bars), the year before (dashed) and hours (right axis) – lines smooth. */
export function MonthsChart({ months, year }: { months: YearMonth[]; year: number }) {
  const config = {
    km: { label: `${year} · km`, color: SERIES.distance.color },
    prevKm: { label: `${year - 1} · km`, color: SERIES.distanceCompare.color },
    h: { label: t('metric.hours'), color: SERIES.hours.color },
  } satisfies ChartConfig;
  const kmTicks = niceTicks(0, Math.max(1, ...months.flatMap((m) => [m.km, m.prevKm])));
  const hTicks = niceTicks(0, Math.max(1, ...months.map((m) => m.h)));
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: YearMonth }[] }) => {
    const m = active && payload?.[0]?.payload;
    if (!m) return null;
    return (
      <TooltipBox title={t('common.monthYear', { month: m.long, year })} lines={[
        { label: config.km.label, color: config.km.color, value: `${nf(m.km)} km` },
        { label: config.prevKm.label, color: config.prevKm.color, value: `${nf(m.prevKm)} km` },
        { label: config.h.label, color: config.h.color, value: `${nf(m.h, 1)} h` },
      ]} />
    );
  };
  return (
    <>
      <p className="sr-only">{months.map((m) => `${m.long}: ${nf(m.km)} km`).join(', ')}</p>
      <SeriesLegend items={[
        { label: config.km.label, color: config.km.color, kind: 'bar' },
        { label: config.prevKm.label, color: config.prevKm.color, kind: 'dashed' },
        { label: config.h.label, color: config.h.color },
      ]} />
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <ComposedChart data={months} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={6} />
          <YAxis yAxisId="km" tickLine={false} axisLine={false} width={48} ticks={kmTicks} domain={[0, kmTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <YAxis yAxisId="h" orientation="right" tickLine={false} axisLine={false} width={36} ticks={hTicks} domain={[0, hTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          <Bar yAxisId="km" dataKey="km" fill="var(--color-km)" fillOpacity={0.85} radius={barRadius(months.length)} maxBarSize={48} isAnimationActive={false} />
          <Line yAxisId="km" dataKey="prevKm" type={SERIES.distanceCompare.curve} stroke="var(--color-prevKm)" strokeWidth={1.5} strokeDasharray={SERIES.distanceCompare.dash} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          <Line yAxisId="h" dataKey="h" type={SERIES.hours.curve} stroke="var(--color-h)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
