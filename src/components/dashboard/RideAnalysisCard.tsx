import * as React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Home, Bike } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { CardLabel } from '@/components/app/CardLabel';
import { EmptyState } from '@/components/app/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { ZoneBars, ZoneLabel } from '@/components/charts/ZoneBars';
import { SERIES } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { analysisStreams, rideAnalysis } from './ride-analysis-data.ts';
import { WithTip } from '@/components/app/KeyFigures';
import { BasisToggle, type Basis } from './parts';
import { useChartStreams } from '@/components/app/use-chart-streams';
import type { ChartStreams } from '@/lib/chart-streams.ts';
import { DecouplingScale } from '@/components/ride/DecouplingScale';

function StreamChart({ streams }: { streams: ChartStreams | null | undefined }) {
  if (streams === undefined) return <Skeleton className="h-[300px] rounded-md" />;
  const S = analysisStreams(streams);
  if ('empty' in S) return <EmptyState className="h-[300px]">{S.empty}</EmptyState>;
  const config = {
    watts: { label: t('metric.power'), color: SERIES.streamPower.color },
    hr: { label: t('metric.heartRate'), color: SERIES.streamHeartRate.color },
    cad: { label: t('metric.cadence'), color: SERIES.streamCadence.color },
    alt: { label: t('metric.altitude'), color: SERIES.streamElevation.color },
  } satisfies ChartConfig;
  const unit = { watts: ' W', hr: ' bpm', cad: ' rpm', alt: ' m' } as const;
  const keys = (Object.keys(config) as (keyof typeof config)[]).filter((k) => S.has[k]);
  type Row = { t: number } & Partial<Record<keyof typeof config, number | null>>;
  const minute = (s: number) => Math.round(s / 60);
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    return r ? <TooltipBox title={t('dash.chart.minute', { m: minute(r.t) })} lines={keys.map((k) => ({ label: config[k].label, color: config[k].color, value: r[k] != null ? `${Math.round(r[k]!)}${unit[k]}` : '–' }))} /> : null;
  };
  return (
    <>
      <SeriesLegend items={keys.filter((k) => k !== 'cad').map((k) => ({ label: config[k].label, color: config[k].color, kind: k === 'alt' ? 'bar' as const : 'line' as const }))} />
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <ComposedChart data={S.rows} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-stream-power" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-watts)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--color-watts)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="t" tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} tickFormatter={(s) => `${minute(s)}′`} />
          <YAxis yAxisId="w" hide={!S.has.watts} tickLine={false} axisLine={false} width={40} domain={[0, 'auto']} tickFormatter={(v) => nf(v)} />
          <YAxis yAxisId="hr" hide={!S.has.hr} orientation="right" tickLine={false} axisLine={false} width={34} domain={['auto', 'auto']} tickFormatter={(v) => nf(v)} />
          {/* Hidden scales still take their width in the layout – 0 keeps the power axis in place */}
          <YAxis yAxisId="alt" hide width={0} domain={['dataMin', 'auto']} />
          <YAxis yAxisId="cad" hide width={0} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          {S.has.alt && <Area yAxisId="alt" dataKey="alt" type={SERIES.streamElevation.curve} stroke="var(--color-alt)" strokeOpacity={0.6} strokeWidth={1} fill="var(--color-alt)" fillOpacity={0.14} dot={false} activeDot={false} isAnimationActive={false} />}
          {S.has.watts && <Area yAxisId="w" dataKey="watts" type={SERIES.streamPower.curve} stroke="var(--color-watts)" strokeWidth={1.5} fill="url(#fill-stream-power)" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
          {S.has.hr && <Line yAxisId="hr" dataKey="hr" type={SERIES.streamHeartRate.curve} stroke="var(--color-hr)" strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
          {S.has.cad && <Line yAxisId="cad" dataKey="cad" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none" />}
        </ComposedChart>
      </ChartContainer>
    </>
  );
}

const mini = 'mb-2 flex items-center justify-between gap-2 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase';

/**
 * Ride analysis: one ride of the period (newest first, ‹ › to browse) with its streams, key figures,
 * time in zone, aerobic decoupling and what to eat. `id` / `onSelect` – the selection lives in the
 * dashboard, so the fuelling matrix can highlight the ride's cell.
 */
export function RideAnalysisCard({ D, id, onSelect, basis }: { D: any; id: string | null; onSelect: (id: string) => void; basis: Basis }) {
  const A = id ? rideAnalysis(D, id, { basis }) : null;
  const streams = useChartStreams(A ? A.id : null);
  const [tab, setTab] = React.useState<Basis>('power');
  if (!A) {
    return (
      <Card className="px-5" data-testid="ride-analysis">
        <CardLabel>{t('dash.sec.analysis')}</CardLabel>
        <EmptyState>{t('dash.deep.noRide')}</EmptyState>
      </Card>
    );
  }
  const kind = (tab === 'power' && A.tiz.power) || !A.tiz.hr ? 'power' : 'hr';
  const tiz = A.tiz[kind];
  const Icon = A.indoor ? Home : Bike;
  return (
    <Card className="gap-5" data-testid="ride-analysis">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <CardLabel>{t('dash.sec.analysis')}</CardLabel>
          <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{A.name}</span>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{A.when}</span>
            <span className="rounded-sm bg-background px-1.5 py-0.5"><ZoneLabel zone={A.zone} label={A.zoneLabel} /></span>
            <span>{A.classification}</span>
            {A.prs && <span className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-[11px]">{A.prs}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={!A.olderId} onClick={() => A.olderId && onSelect(A.olderId)} aria-label={t('dash.deep.olderTip')}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-14 text-center font-mono text-xs tabular-nums" aria-live="polite">{A.position}</span>
          <Button variant="ghost" size="icon" className="size-8" disabled={!A.newerId} onClick={() => A.newerId && onSelect(A.newerId)} aria-label={t('dash.deep.newerTip')}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <CardContent className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <StreamChart streams={streams} />
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {A.chips.map((c) => (
              <div key={c.label} className="rounded-md bg-background px-2.5 py-1.5">
                <dt className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{c.label}</dt>
                <dd className="text-sm font-medium tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
          <a href={A.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
            {t('dash.deep.allDetails')} <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <div className="grid content-start gap-5">
          <div>
            <div className={mini}>
              <h4>{t('dash.deep.tiz')}</h4>
              <BasisToggle value={kind} onChange={setTab} label={t('dash.deep.tiz')} />
            </div>
            {tiz ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">{tiz.label}</p>
                <ZoneBars rows={tiz.rows} total={tiz.total} compact />
              </>
            ) : <p className="text-xs text-muted-foreground">{t('dash.deep.noStreams')}</p>}
          </div>
          <div>
            <WithTip tipHtml={t('decoupling.tip')} className="w-fit"><h4 className={mini}>{t('decoupling.title')}</h4></WithTip>
            {'note' in A.decoupling ? <p className="text-xs text-muted-foreground">{A.decoupling.note}</p> : (
              <>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xl font-semibold tabular-nums">{A.decoupling.value}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${A.decoupling.tone})` }} aria-hidden="true" />
                    {A.decoupling.label}
                  </span>
                </p>
                <div className="relative mt-2 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--positive), var(--warning) 50%, var(--negative))' }} aria-hidden="true">
                  <span className="absolute -top-1 -bottom-1 w-1 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card" style={{ left: `${A.decoupling.share.toFixed(1)}%` }} />
                </div>
                <DecouplingScale className="mt-1" />
              </>
            )}
          </div>
          <div className="rounded-md bg-background px-3 py-2.5 text-xs">
            <h4 className={mini}>{t('fuel.title')}</h4>
            <p><b className="font-medium">{t('fuel.during')}</b> {A.fuel.during}</p>
            <p><b className="font-medium">{t('fuel.drink')}</b> {A.fuel.drink}</p>
            <p><b className="font-medium">{t('fuel.after')}</b> {A.fuel.after}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
