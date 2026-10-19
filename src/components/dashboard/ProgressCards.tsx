import * as React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Scatter, XAxis, YAxis, useActiveTooltipDataPoints, type ScatterShapeProps } from 'recharts';
import { ChartCard } from '@/components/app/ChartCard';
import { DeltaBadge } from '@/components/app/DeltaBadge';
import { EmptyState } from '@/components/app/EmptyState';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { SERIES, niceTicks, zoneColor } from '@/components/charts/series';
import { SeriesLegend, TooltipBox, activeRow } from '@/components/charts/chart-parts';
import { nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { curveValue, efficiency, periodCurve } from './progress-data.ts';
import { type Basis } from './parts';
import { routes } from '@/lib/routes.ts';
import type { DecodedPeriod } from '@/lib/dashboard-payload.ts';
import type { AthleteZones } from '@/training/index.ts';

const cd = (key: string) => t('dash.card.' + key);

/** Reports the ride under the tooltip (mouse or arrow keys) – the chart's keyboard path to a ride. */
function ActiveRide({ onChange }: { onChange: (id: string | null) => void }) {
  const id = useActiveTooltipDataPoints<{ id: string }>()?.[0]?.id ?? null;
  React.useEffect(() => onChange(id), [id, onChange]);
  return null;
}

/**
 * EF per ride (dots in its zone colour) and the rolling trend. A click opens the ride; on the
 * keyboard the arrow keys move between rides (Recharts accessibility layer) and Enter opens one.
 */
export function EfficiencyCard({ D, basis }: { D: DecodedPeriod; basis: Basis }) {
  const E = efficiency(D, basis);
  const active = React.useRef<string | null>(null);
  const setActive = React.useCallback((id: string | null) => { active.current = id; }, []);
  const hintId = React.useId();
  const open = (id: string | null | undefined) => { if (id) location.href = routes.ride(id); };
  const config = {
    ef: { label: t('dash.chart.efPerRide'), color: 'var(--muted-foreground)' },
    trend: { label: t('dash.chart.efTrend'), color: SERIES.efficiencyTrend.color },
  } satisfies ChartConfig;
  type Row = NonNullable<typeof E>['rows'][number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    return r ? (
      <TooltipBox title={r.name} subtitle={r.date} lines={[
        { label: config.ef.label, color: zoneColor(r.zone), value: `${nf(r.ef, 2)} W/bpm` },
        { label: config.trend.label, color: config.trend.color, value: `${nf(r.trend, 2)} W/bpm` },
      ]} />
    ) : null;
  };
  const badge = E?.trend && <DeltaBadge pct={E.trend.pct} tip={E.trend.tip} decimals={1} />;
  return (
    <ChartCard title={cd('ef')} description={cd('efSub')} action={badge} data-testid="efficiency-chart">
      {!E ? <EmptyState>{t('dash.chart.fewEf')}</EmptyState> : (
        <>
          <SeriesLegend items={[{ label: config.ef.label, color: config.ef.color, kind: 'bar' }, { label: config.trend.label, color: config.trend.color }]} />
          <p id={hintId} className="sr-only">{t('dash.chart.efKeys')}</p>
          <ChartContainer config={config} aria-describedby={hintId}
            className="aspect-auto h-[260px] w-full rounded-md has-[.recharts-surface:focus-visible]:ring-[3px] has-[.recharts-surface:focus-visible]:ring-ring/50 [&_.recharts-surface]:cursor-pointer"
            onKeyDown={(e) => { if (e.key === 'Enter') open(active.current); }}>
            <ComposedChart data={E.rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              onClick={(e) => open(activeRow(E.rows, e)?.id)}>
              <ActiveRide onChange={setActive} />
              <defs>
                <linearGradient id="fill-ef" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-trend)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--color-trend)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={(v) => nf(v, 2)}
                label={{ value: t('dash.chart.npPerBeat'), angle: -90, position: 'insideLeft', offset: 0, style: { textAnchor: 'middle', fill: 'var(--muted-foreground)', fontSize: 11 } }} />
              <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
              <Area dataKey="trend" type={SERIES.efficiencyTrend.curve} stroke="var(--color-trend)" strokeWidth={2.25} fill="url(#fill-ef)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
              <Scatter dataKey="ef" isAnimationActive={false}
                shape={(p: ScatterShapeProps) => <circle cx={p.cx} cy={p.cy} r={E.rows.length > 150 ? 2.5 : 3.5} fill={zoneColor(p.payload.zone)} stroke="var(--card)" strokeWidth={1} />} />
            </ComposedChart>
          </ChartContainer>
        </>
      )}
    </ChartCard>
  );
}

/** Power curve of the period vs. all-time and the period's 2nd half, today's FTP as a line. */
export function PeriodCurveCard({ D, zones, kg }: { D: DecodedPeriod; zones: AthleteZones; kg: number }) {
  const P = periodCurve(D, { ftp: zones.ftp, kg });
  const sub = cd(D.hasPrevious ? 'curveSub' : 'curveSubAll');
  const config = {
    curve: { label: t('dash.chart.period'), color: SERIES.curvePeriod.color },
    curveAll: { label: t('common.allTime'), color: SERIES.curveAllTime.color },
    curve2: { label: t('dash.chart.secondHalf'), color: SERIES.curveSecondHalf.color },
    ftp: { label: 'FTP', color: SERIES.ftp.color },
  } satisfies ChartConfig;
  type Row = NonNullable<typeof P>['rows'][number];
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    const line = (key: keyof typeof config, w: number | null, wkg: number | null) => ({ label: config[key].label, color: config[key].color, value: curveValue(w, wkg) });
    return (
      <TooltipBox title={r.label} lines={[
        ...(r.curve != null ? [line('curve', r.curve, r.curveWkg)] : []),
        ...(P!.compare && r.curveAll != null ? [line('curveAll', r.curveAll, r.curveAllWkg)] : []),
        ...(P!.compare && r.curve2 != null ? [line('curve2', r.curve2, r.curve2Wkg)] : []),
        line('ftp', r.ftp, r.ftpWkg),
      ]} />
    );
  };
  const ticks = P ? niceTicks(0, Math.max(zones.ftp, ...P.rows.flatMap((r) => [r.curve ?? 0, P.compare ? r.curveAll ?? 0 : 0]))) : [];
  return (
    <ChartCard title={cd('curve')} description={sub} data-testid="period-curve-chart">
      {!P ? <EmptyState>{t('dash.chart.noCurve')}</EmptyState> : (
        <>
          <SeriesLegend items={[
            { label: config.curve.label, color: config.curve.color },
            ...(P.compare ? [{ label: config.curveAll.label, color: config.curveAll.color }, { label: config.curve2.label, color: config.curve2.color, kind: 'dashed' as const }] : []),
            { label: config.ftp.label, color: config.ftp.color, kind: 'dashed' },
          ]} />
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <ComposedChart data={P.rows} margin={{ top: 8, right: 14, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="fill-period-curve" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-curve)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-curve)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
              <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
              <ReferenceLine y={zones.ftp} stroke="var(--color-ftp)" strokeDasharray={SERIES.ftp.dash} strokeWidth={1.5} />
              <Area dataKey="curve" type={SERIES.curvePeriod.curve} stroke="var(--color-curve)" strokeWidth={2.25} fill="url(#fill-period-curve)" connectNulls dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
              {P.compare && <Line dataKey="curveAll" type={SERIES.curveAllTime.curve} stroke="var(--color-curveAll)" strokeWidth={1.25} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
              {P.compare && <Line dataKey="curve2" type={SERIES.curveSecondHalf.curve} stroke="var(--color-curve2)" strokeWidth={1.5} strokeDasharray={SERIES.curveSecondHalf.dash} connectNulls dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
            </ComposedChart>
          </ChartContainer>
        </>
      )}
    </ChartCard>
  );
}
