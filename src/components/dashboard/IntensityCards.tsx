import * as React from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceArea, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/app/ChartCard';
import { EmptyState } from '@/components/app/EmptyState';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ShareStrip, ZoneBars, ZoneLabel } from '@/components/charts/ZoneBars';
import { SERIES, barRadius, niceTicks, zoneColor } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { powerHr, rhythm, timeInZones, zoneShare, zoneWeeks } from './intensity-data.js';
import { Figure } from '@/components/app/KeyFigures';
import { BasisToggle, type Basis } from './parts';

const cd = (key: string, x?: Record<string, unknown>) => t('dash.card.' + key, x);

/** Hours per week (month) stacked by zone. */
export function ZoneWeeksCard({ D, basis }: { D: any; basis: Basis }) {
  const W = zoneWeeks(D, basis);
  const monthly = D.days > 400;
  const title = cd(monthly ? 'monthlyZone' : 'weeklyZone'), sub = cd(monthly ? 'perMonth' : 'perWeek');
  if (!W) return <ChartCard title={title} description={sub} data-testid="zone-weeks-chart"><EmptyState>{t('dash.chart.noRidesPeriod')}</EmptyState></ChartCard>;
  const series = [...W.series.map((s) => ({ ...s, color: zoneColor(s.zone) })), ...(W.unknown ? [{ ...W.unknown, color: 'var(--muted-foreground)' }] : [])];
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  type Row = (typeof W.rows)[number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const row = active && payload?.[0]?.payload;
    if (!row) return null;
    const lines = series.filter((s) => (row as any)[s.key] > 0).map((s) => ({ label: s.label, color: s.color, value: `${nf((row as any)[s.key], 1)} h` }));
    return <TooltipBox title={row.title} lines={lines} footer={row.total} className="min-w-52" />;
  };
  const max = Math.max(...W.rows.map((r) => series.reduce((s, x) => s + ((r as any)[x.key] || 0), 0)));
  const ticks = niceTicks(0, max, 4);
  return (
    <ChartCard title={title} description={sub} data-testid="zone-weeks-chart">
      <SeriesLegend items={series.map((s) => ({ label: s.label, color: s.color, kind: 'bar' as const }))} />
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={W.rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={40} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--background)' }} content={<Tip />} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} stackId="h" fill={`var(--color-${s.key})`} stroke="var(--card)" strokeWidth={1} isAnimationActive={false} />)}
        </BarChart>
      </ChartContainer>
      <p className="sr-only">{W.rows.map((r) => `${r.title}: ${r.total}`).join('; ')}</p>
    </ChartCard>
  );
}

/** Ride time by zone of the ride classification – donut with the classified hours in its centre. */
export function ZoneShareCard({ D, basis }: { D: any; basis: Basis }) {
  const Z = zoneShare(D, basis);
  const sub = cd(basis === 'hr' ? 'hrZones5' : 'powerZones7');
  return (
    <ChartCard title={cd('timeByZone')} description={sub} data-testid="zone-share-chart">
      {!Z ? <EmptyState>{t('dash.chart.noIntensity')}</EmptyState> : (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-52">
            <ChartContainer config={Object.fromEntries(Z.rows.map((r) => [`z${r.zone}`, { label: r.label, color: zoneColor(r.zone) }]))} className="aspect-square w-full">
              <PieChart>
                <ChartTooltip content={({ active, payload }: any) => {
                  const r = active && payload?.[0]?.payload;
                  return r ? <TooltipBox title={r.label} lines={[{ label: t('metric.hours'), color: zoneColor(r.zone), value: r.value }]} /> : null;
                }} />
                <Pie data={Z.rows} dataKey="hours" nameKey="label" innerRadius="70%" outerRadius="96%" paddingAngle={1.5} cornerRadius={2} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
                  {Z.rows.map((r) => <Cell key={r.zone} fill={zoneColor(r.zone)} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">{Z.total}</span>
              <span className="text-xs text-muted-foreground">{Z.sub}</span>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {Z.rows.map((r) => (
              <li key={r.zone} className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate"><ZoneLabel zone={r.zone} label={r.label} /></span>
                <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{r.pct}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartCard>
  );
}

/** Time in zone from the ride histograms (power or HR switchable in the card). */
export function TimeInZonesCard({ D }: { D: any }) {
  const [basis, setBasis] = React.useState<Basis>('power');
  const X = timeInZones(D, basis);
  return (
    <ChartCard title={cd('tiz')} description={cd('tizSub')} data-testid="time-in-zones"
      action={<BasisToggle value={basis} onChange={setBasis} label={cd('tiz')} />}>
      {'empty' in X ? <EmptyState>{X.empty}</EmptyState> : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-3">
            {X.figures!.map(([value, label]) => <Figure key={label} value={value} label={label} />)}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{X.note}</p>
          <ZoneBars rows={X.rows!} total={X.total!} />
        </>
      )}
    </ChartCard>
  );
}

function RhythmBars({ rows, dataKey, color, label, tick }: { rows: any[]; dataKey: string; color: string; label: string; tick?: (v: string, i: number) => string }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{label}</h4>
      <ChartContainer config={{ [dataKey]: { label, color } }} className="aspect-auto h-36 w-full">
        <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: -12 }} barCategoryGap="14%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval={0} tickFormatter={tick} />
          <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} tickCount={4} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--background)' }} content={({ active, payload }: any) => {
            const r = active && payload?.[0]?.payload;
            return r ? <TooltipBox title={r.title ?? r.label} lines={[{ label, color, value: r.value }]} /> : null;
          }} />
          <Bar dataKey={dataKey} radius={barRadius(rows.length)} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fill={color} fillOpacity={r.top ? 1 : 0.4} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Rhythm: hours per weekday, starts per hour, indoor vs. outdoor. */
export function RhythmCard({ D }: { D: any }) {
  const R = rhythm(D);
  return (
    <ChartCard title={cd('rhythm')} description={cd('rhythmSub')} data-testid="rhythm-card">
      {!R ? <EmptyState>{t('dash.chart.noRidesPeriod')}</EmptyState> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <RhythmBars rows={R.weekdays} dataKey="hours" color="var(--brand)" label={cd('hoursWeekday')} />
            <RhythmBars rows={R.hours} dataKey="starts" color="var(--brand)" label={cd('startsHour')} tick={(_, i) => (i % 3 === 0 ? t('common.hourTick', { h: i }) : '')} />
          </div>
          <div className="mt-4">
            <ShareStrip segments={R.split.map((s) => ({ key: s.key, value: s.share, color: s.key === 'outdoor' ? 'var(--brand)' : 'var(--muted-foreground)', title: `${s.label} · ${s.hours} · ${s.pct}` }))} />
            <ul className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {R.split.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ background: s.key === 'outdoor' ? 'var(--brand)' : 'var(--muted-foreground)' }} aria-hidden="true" />
                  {s.label} <b className="font-medium text-foreground">{s.hours}</b> · {s.pct}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/** Average power and heart rate per ride, Z2 power window as a band; a click opens the ride. */
export function PowerHrCard({ D, zones, base }: { D: any; zones: any; base: string }) {
  const P = powerHr(D, zones);
  const config = {
    w: { label: t('metric.avgPower'), color: SERIES.ridePower.color },
    hr: { label: t('metric.avgHr'), color: SERIES.rideHeartRate.color },
  } satisfies ChartConfig;
  type Row = NonNullable<typeof P>['rows'][number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    return (
      <TooltipBox title={r.name} subtitle={r.meta} footer={[r.ef, t('dash.chart.clickAnalysis')].filter(Boolean).join(' · ')} className="min-w-56" lines={[
        { label: config.w.label, color: config.w.color, value: r.w != null ? `${r.w} W` : '–' },
        { label: t('metric.np'), color: config.w.color, value: r.np != null ? `${r.np} W` : '–' },
        { label: config.hr.label, color: config.hr.color, value: r.hr != null ? `${r.hr} bpm` : '–' },
        { label: t('metric.maxHr'), color: config.hr.color, value: r.hrMax != null ? `${r.hrMax} bpm` : '–' },
      ]} />
    );
  };
  return (
    <ChartCard title={cd('phr')} description={cd('phrSub')} data-testid="power-hr-chart">
      {!P ? <EmptyState>{t('dash.chart.noPowerHr')}</EmptyState> : (
        <>
          <SeriesLegend items={[
            { label: config.w.label, color: config.w.color },
            { label: config.hr.label, color: config.hr.color },
            { label: t('dash.chart.zone2'), color: 'var(--zone-2)', kind: 'bar' },
          ]} />
          <ChartContainer config={config} className="aspect-auto h-[300px] w-full [&_.recharts-surface]:cursor-pointer">
            <ComposedChart data={P.rows} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}
              onClick={(e: any) => { const r = P.rows[e?.activeIndex ?? e?.activeTooltipIndex]; if (r) location.href = `${base}rides/${r.id}`; }}>
              <defs>
                <linearGradient id="fill-phr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-w)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-w)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
              <YAxis yAxisId="w" tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} tickFormatter={(v) => `${nf(v)}`} />
              <YAxis yAxisId="hr" orientation="right" tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} tickFormatter={(v) => `${nf(v)}`} />
              <ReferenceArea yAxisId="w" y1={P.z2.from} y2={P.z2.to} fill="var(--zone-2)" fillOpacity={0.12} stroke="none" ifOverflow="extendDomain" />
              <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
              <Area yAxisId="w" dataKey="w" type={SERIES.ridePower.curve} stroke="var(--color-w)" strokeWidth={2} fill="url(#fill-phr)" baseValue="dataMin" connectNulls dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              <Line yAxisId="hr" dataKey="hr" type={SERIES.rideHeartRate.curve} stroke="var(--color-hr)" strokeWidth={2} connectNulls dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </ComposedChart>
          </ChartContainer>
        </>
      )}
    </ChartCard>
  );
}
