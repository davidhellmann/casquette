import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import type { YearMonth } from './YearView';

/** Share of time in each power zone per month, as 100 % stacked bars (square: the segments touch). */
export function IntensityChart({ months, zoneNames, year }: { months: YearMonth[]; zoneNames: string[]; year: number }) {
  if (!months.some((m) => m.zones)) return <EmptyState>{t('year.noPowerStreamsYear')}</EmptyState>;
  const zones = zoneNames.map((name, i) => ({ key: `z${i + 1}`, label: `Z${i + 1} ${name}`, color: `var(--zone-${i + 1})` }));
  const config = Object.fromEntries(zones.map((z) => [z.key, { label: z.label, color: z.color }])) satisfies ChartConfig;
  const rows = months.map((m) => ({ ...m, ...Object.fromEntries(zones.map((z, i) => [z.key, m.zones ? m.zones[i] ?? 0 : null])) }));
  type Row = (typeof rows)[number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const m = active && payload?.[0]?.payload;
    if (!m || !m.zones) return null;
    return (
      <TooltipBox title={t('common.monthYear', { month: m.long, year })} lines={zones.filter((_, i) => (m.zones![i] ?? 0) >= 0.5).map((z) => ({
        label: z.label, color: z.color, value: `${nf(m[z.key as keyof Row] as number)} %`,
      }))} />
    );
  };
  return (
    <>
      <SeriesLegend items={zones.map((z) => ({ label: z.label, color: z.color, kind: 'bar' }))} />
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={6} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={[0, 25, 50, 75, 100]} domain={[0, 100]} tickFormatter={(v) => `${v} %`} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          {zones.map((z) => (
            <Bar key={z.key} dataKey={z.key} stackId="zones" fill={z.color} radius={0} maxBarSize={48} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartContainer>
    </>
  );
}
