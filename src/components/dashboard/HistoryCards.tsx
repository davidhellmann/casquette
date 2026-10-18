import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/app/ChartCard';
import { CardLabel } from '@/components/app/CardLabel';
import { DeltaBadge } from '@/components/app/DeltaBadge';
import { EmptyState } from '@/components/app/EmptyState';
import { Card } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { COMPARE_COLORS, SERIES, barRadius, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { allTime, historySince, kilometreRace, records, yearsCompared } from './history-data.js';
import { Figure } from '@/components/app/KeyFigures';
import { Section } from './parts';

const cd = (key: string) => t('dash.card.' + key);

/** All-time totals, the best year and the longest ride. */
export function AllTimeCard({ D, base }: { D: any; base: string }) {
  const A = allTime(D);
  return (
    <ChartCard title={t('dash.allTime.title')} description={historySince(D)} data-testid="all-time-card">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {A.items.map((x) => <Figure key={x.key} value={x.value} label={x.label} sub={x.sub} />)}
        {A.longest && (
          <a href={`${base}rides/${A.longest.id}`} className="-m-1.5 rounded-md p-1.5 hover:bg-background">
            <Figure value={A.longest.value} label={A.longest.label} sub={A.longest.name} />
          </a>
        )}
      </div>
    </ChartCard>
  );
}

/** Kilometres (bars) and hours (line) per year. */
export function YearsCard({ D }: { D: any }) {
  const Y = yearsCompared(D);
  const config = {
    km: { label: t('metric.kilometres'), color: SERIES.cumulative.color },
    h: { label: t('metric.hours'), color: SERIES.hours.color },
  } satisfies ChartConfig;
  type Row = NonNullable<typeof Y>[number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    return r ? <TooltipBox title={r.year} footer={r.footer} lines={[
      { label: config.km.label, color: config.km.color, value: nf(r.km) },
      { label: config.h.label, color: config.h.color, value: nf(r.h, 1) },
    ]} /> : null;
  };
  const kmTicks = Y ? niceTicks(0, Math.max(...Y.map((r) => r.km)), 4) : [];
  return (
    <ChartCard title={cd('years')} description={cd('yearsSub')} data-testid="years-chart">
      {!Y ? <EmptyState>{t('common.noData')}</EmptyState> : (
        <>
          <SeriesLegend items={[{ label: config.km.label, color: config.km.color, kind: 'bar' }, { label: config.h.label, color: config.h.color }]} />
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <ComposedChart data={Y} margin={{ top: 8, right: 0, bottom: 0, left: -4 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis yAxisId="km" tickLine={false} axisLine={false} width={48} ticks={kmTicks} domain={[0, kmTicks.at(-1)!]} tickFormatter={(v) => nf(v)} />
              <YAxis yAxisId="h" orientation="right" tickLine={false} axisLine={false} width={36} domain={[0, 'auto']} tickFormatter={(v) => nf(v)} />
              <ChartTooltip cursor={{ fill: 'var(--background)' }} content={<Tip />} />
              <Bar yAxisId="km" dataKey="km" radius={barRadius(Y.length)} isAnimationActive={false}>
                {Y.map((r) => <Cell key={r.year} fill="var(--color-km)" fillOpacity={r.current ? 1 : 0.4} />)}
              </Bar>
              <Line yAxisId="h" dataKey="h" type={SERIES.hours.curve} stroke="var(--color-h)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        </>
      )}
    </ChartCard>
  );
}

/** Cumulative kilometres per year – this year highlighted against the five before. */
export function CumulativeCard({ D }: { D: any }) {
  const K = kilometreRace(D);
  const earlier = K ? K.years.filter((y) => !y.current) : [];
  const years = K ? K.years.map((y) => ({ ...y, color: y.current ? SERIES.cumulative.color : COMPARE_COLORS[earlier.indexOf(y) % COMPARE_COLORS.length] })) : [];
  const config = Object.fromEntries(years.map((y) => [y.key, { label: y.label, color: y.color }])) satisfies ChartConfig;
  type Row = NonNullable<typeof K>['rows'][number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    const lines = years.filter((y) => (r as any)[y.key] != null).sort((a, b) => ((r as any)[b.key] || 0) - ((r as any)[a.key] || 0))
      .map((y) => ({ label: y.label, color: y.color, value: `${nf((r as any)[y.key])} km` }));
    return <TooltipBox title={r.label} lines={lines} />;
  };
  const badge = K?.ytd && <DeltaBadge pct={K.ytd.pct} tip={K.ytd.tip} label={K.ytd.text} />;
  const current = years.find((y) => y.current);
  return (
    <ChartCard title={cd('race')} description={cd('raceSub')} action={badge} data-testid="cumulative-chart">
      {!K ? <EmptyState>{t('common.noData')}</EmptyState> : (
        <>
          <SeriesLegend items={years.map((y) => ({ label: y.label, color: y.color }))} />
          <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
            <ComposedChart data={K.rows} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
              <defs>
                <linearGradient id="fill-race" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.cumulative.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES.cumulative.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} tickFormatter={(_, i) => K.rows[i]?.month ?? ''} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => nf(v)} />
              <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
              {years.filter((y) => !y.current).map((y) => (
                <Line key={y.key} dataKey={y.key} type={SERIES.cumulative.curve} stroke={`var(--color-${y.key})`} strokeOpacity={0.75} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
              ))}
              {current && <Area dataKey={current.key} type={SERIES.cumulative.curve} stroke={`var(--color-${current.key})`} strokeWidth={2.5} fill="url(#fill-race)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />}
            </ComposedChart>
          </ChartContainer>
        </>
      )}
    </ChartCard>
  );
}

/** The eight records of the period – each card opens its ride. */
export function RecordsSection({ D, base, allTime: all }: { D: any; base: string; allTime: boolean }) {
  const title = t(all ? 'dash.sec.recordsAll' : 'dash.sec.records');
  if (!D.rides.length) {
    return (
      <Section title={title} testId="records">
        <Card className="px-5"><EmptyState>{t('dash.chart.noRidesPeriod')}</EmptyState></Card>
      </Section>
    );
  }
  return (
    <Section title={title} sub={t('common.clickOpensRide')} testId="records">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {records(D).map((r) => {
          const body = (
            <>
              <CardLabel as="h3" className="bg-transparent px-0 text-muted-foreground">{r.label}</CardLabel>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{r.value}</span>
              {r.name && <span className="truncate text-sm">{r.name}</span>}
              <span className="font-mono text-[11px] text-muted-foreground">{r.date}</span>
            </>
          );
          return (
            <li key={r.key} className="grid">
              {r.id ? (
                <a href={`${base}rides/${r.id}`} className="grid gap-1 rounded-lg bg-card px-5 py-4 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring">{body}</a>
              ) : <div className="grid gap-1 rounded-lg bg-card px-5 py-4">{body}</div>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
