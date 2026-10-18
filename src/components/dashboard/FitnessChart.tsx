import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { fmtDate, nf, fmtWeekdayDate, fmtMonthYearShort } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { fitnessChartData } from './fitness-data.js';

type Row = ReturnType<typeof fitnessChartData>[number];

const config = {
  ctl: { label: t('dash.chart.ctl'), color: SERIES.fitness.color },
  atl: { label: t('dash.chart.atl'), color: SERIES.fatigue.color },
  tsb: { label: t('dash.chart.tsb'), color: SERIES.formPositive.color },
} satisfies ChartConfig;

function FitnessTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active && payload?.[0]?.payload;
  if (!row) return null;
  const line = (key: keyof typeof config, value: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      <span className="text-muted-foreground">{config[key].label}</span>
      <span className="ml-auto font-mono font-medium tabular-nums">{nf(value, 1)}</span>
    </div>
  );
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground">
      <div className="font-medium">{fmtWeekdayDate(row.d)}</div>
      {line('ctl', row.ctl, SERIES.fitness.color)}
      {line('atl', row.atl, SERIES.fatigue.color)}
      {line('tsb', row.tsb, row.tsb >= 0 ? SERIES.formPositive.color : SERIES.formNegative.color)}
      <div className="text-muted-foreground">{t('dash.chart.dayLoad', { v: nf(row.load) })}</div>
    </div>
  );
}

/** Fitness (smooth area), fatigue (hard, dashed) and daily form (square bars) over the period. */
export function FitnessChart({ D }: { D: any }) {
  const rows = fitnessChartData(D);
  if (!rows.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  const long = D.days > 400;
  const tick = (day: string) => {
    const d = new Date(`${day}T00:00:00`);
    return long ? fmtMonthYearShort(d) : fmtDate(d);
  };
  const today = rows.at(-1)!;
  const ticks = niceTicks(Math.min(0, ...rows.map((r) => r.tsb)), Math.max(...rows.flatMap((r) => [r.ctl, r.atl, r.tsb])));
  return (
    <>
      <p className="sr-only">
        {`${config.ctl.label} ${nf(today.ctl, 1)}, ${config.atl.label} ${nf(today.atl, 1)}, ${config.tsb.label} ${nf(today.tsb, 1)}`}
      </p>
      <ul className="mb-3 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full" style={{ background: SERIES.fitness.color }} />{config.ctl.label}</li>
        <li className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: SERIES.fatigue.color }} />{config.atl.label}</li>
        <li className="flex items-center gap-1.5">
          <span className="flex h-2.5 gap-px"><span className="w-1.5 rounded-[1px] opacity-60" style={{ background: SERIES.formPositive.color }} /><span className="w-1.5 rounded-[1px] opacity-60" style={{ background: SERIES.formNegative.color }} /></span>
          {config.tsb.label}
        </li>
      </ul>
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full" data-testid="fitness-chart">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap={0}>
          <defs>
            <linearGradient id="fill-ctl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ctl)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-ctl)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={44} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<FitnessTooltip />} />
          <Bar dataKey="tsb" radius={0} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.day} fill={r.tsb >= 0 ? SERIES.formPositive.color : SERIES.formNegative.color} fillOpacity={0.45} />
            ))}
          </Bar>
          <Area dataKey="ctl" type={SERIES.fitness.curve} stroke="var(--color-ctl)" strokeWidth={2.25} fill="url(#fill-ctl)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          <Line dataKey="atl" type={SERIES.fatigue.curve} stroke="var(--color-atl)" strokeWidth={1.5} strokeDasharray={SERIES.fatigue.dash} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
