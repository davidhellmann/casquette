import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { SERIES, barRadius, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { routes } from '@/lib/routes.js';
import type { YearSummary } from './YearsView';

const config = {
  km: { label: t('metric.kilometres'), color: SERIES.distance.color },
  h: { label: t('metric.hours'), color: SERIES.hours.color },
} satisfies ChartConfig;

/** All years side by side: kilometres (rounded bars) and hours (smooth line); a click opens the year. */
export function YearsChart({ years }: { years: YearSummary[] }) {
  const rows = years.slice().reverse();
  const kmTicks = niceTicks(0, Math.max(...rows.map((r) => r.km)));
  const hTicks = niceTicks(0, Math.max(...rows.map((r) => r.h)));
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: YearSummary }[] }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    return (
      <TooltipBox title={String(r.year)} lines={[
        { label: config.km.label, color: config.km.color, value: `${nf(r.km)} km` },
        { label: config.h.label, color: config.h.color, value: `${nf(r.h)} h` },
        { label: t('metric.rides'), color: 'transparent', value: nf(r.n) },
        { label: t('years.elev'), color: 'transparent', value: nf(r.elev) },
      ]} />
    );
  };
  const open = (r: { year?: number; payload?: YearSummary }) => {
    const y = r.payload?.year ?? r.year;
    if (y) location.href = routes.year(y);
  };
  return (
    <>
      <p className="sr-only">{rows.map((r) => `${r.year}: ${nf(r.km)} km, ${nf(r.h)} h`).join('; ')}</p>
      <SeriesLegend items={[{ label: config.km.label, color: config.km.color, kind: 'bar' }, { label: config.h.label, color: config.h.color }]} />
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis yAxisId="km" tickLine={false} axisLine={false} width={52} ticks={kmTicks} domain={[0, kmTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <YAxis yAxisId="h" orientation="right" tickLine={false} axisLine={false} width={40} ticks={hTicks} domain={[0, hTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          <Bar yAxisId="km" dataKey="km" fill="var(--color-km)" fillOpacity={0.85} radius={barRadius(rows.length)} maxBarSize={72} className="cursor-pointer" onClick={open} isAnimationActive={false} />
          <Line yAxisId="h" dataKey="h" type={SERIES.hours.curve} stroke="var(--color-h)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
