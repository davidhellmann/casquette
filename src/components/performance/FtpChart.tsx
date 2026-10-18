import { Area, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, barRadius, niceTicks } from '@/components/charts/series';
import { monthLabel, monthTick, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { ftpChartData, hasValues } from './performance-data.js';
import type { PerformanceMonth } from './PerformanceView';

type Row = ReturnType<typeof ftpChartData>[number];

const config = {
  eftp: { label: t('perf.chart.eftp'), color: SERIES.eftp.color },
  ftp: { label: t('perf.chart.ftpHist'), color: SERIES.ftp.color },
  best20: { label: t('perf.chart.best20'), color: SERIES.best20.color },
} satisfies ChartConfig;

const watts = (v: number | null) => (v == null ? '–' : `${nf(v)} W`);

function FtpTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active && payload?.[0]?.payload;
  if (!row) return null;
  return (
    <TooltipBox title={monthLabel(row.key)} lines={[
      { label: config.eftp.label, color: config.eftp.color, value: watts(row.eftp) },
      { label: config.ftp.label, color: config.ftp.color, value: watts(row.ftp) },
      { label: config.best20.label, color: config.best20.color, value: watts(row.best20) },
    ]} />
  );
}

/** Estimated FTP (smooth area), FTP from the history (step) and the best 20 min per month (bars). */
export function FtpChart({ months, current }: { months: PerformanceMonth[]; current: { eftp: number } | null }) {
  const rows = ftpChartData(months);
  if (!hasValues(rows, 'eftp')) return <EmptyState>{t('perf.chart.noStreams')}</EmptyState>;
  const values = rows.flatMap((r) => [r.eftp, r.ftp, r.best20]).filter((v): v is number => v != null);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  return (
    <>
      {current && <p className="sr-only">{`${config.eftp.label} ${watts(current.eftp)}`}</p>}
      <SeriesLegend items={[
        { label: config.eftp.label, color: config.eftp.color },
        { label: config.ftp.label, color: config.ftp.color, kind: 'dashed' },
        { label: config.best20.label, color: config.best20.color, kind: 'bar' },
      ]} />
      <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-eftp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-eftp)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-eftp)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="key" tickFormatter={monthTick} tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<FtpTooltip />} />
          <Bar dataKey="best20" fill="var(--color-best20)" fillOpacity={0.35} radius={barRadius(rows.length)} isAnimationActive={false} />
          <Area dataKey="eftp" type={SERIES.eftp.curve} stroke="var(--color-eftp)" strokeWidth={2.25} fill="url(#fill-eftp)" baseValue={ticks[0]} connectNulls dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          <Line dataKey="ftp" type={SERIES.ftp.curve} stroke="var(--color-ftp)" strokeWidth={1.5} strokeDasharray={SERIES.ftp.dash} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}
