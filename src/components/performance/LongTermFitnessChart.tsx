import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { fmtIso, nf, fmtMonthYearShort } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { TooltipBox } from '@/components/charts/chart-parts';
import { longTermFitnessData } from './performance-data.ts';

type Row = ReturnType<typeof longTermFitnessData>[number];

const config = {
  ctl: { label: t('dash.chart.ctl'), color: SERIES.fitness.color },
  atl: { label: t('dash.chart.atl'), color: SERIES.fatigue.color },
} satisfies ChartConfig;

const tick = (day: string) => fmtMonthYearShort(new Date(`${day}T00:00:00`));

function FitnessTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active && payload?.[0]?.payload;
  if (!row) return null;
  return (
    <TooltipBox title={fmtIso(row.date)} lines={[
      { label: config.ctl.label, color: config.ctl.color, value: nf(row.ctl, 1) },
      { label: config.atl.label, color: config.atl.color, value: nf(row.atl, 1) },
    ]} />
  );
}

/** Fitness (CTL) over the full history, sampled weekly – smoothed by definition, so a smooth area. */
export function LongTermFitnessChart({ ctl }: { ctl: { date: string; ctl: number; atl: number }[] }) {
  const rows = longTermFitnessData(ctl);
  if (!rows.length) return <EmptyState>{t('perf.chart.noData')}</EmptyState>;
  const ticks = niceTicks(0, Math.max(...rows.map((r) => r.ctl)));
  return (
    <>
      <p className="sr-only">{`${config.ctl.label} ${nf(rows.at(-1)!.ctl, 1)}`}</p>
      <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
        <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="fill-ltf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ctl)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-ctl)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="date" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={44} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<FitnessTooltip />} />
          <Area dataKey="ctl" type={SERIES.fitness.curve} stroke="var(--color-ctl)" strokeWidth={2.25} fill="url(#fill-ltf)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </>
  );
}
