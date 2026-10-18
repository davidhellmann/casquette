import { Area, AreaChart, CartesianGrid, ComposedChart, Line, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox, type TooltipLine } from '@/components/charts/chart-parts';
import { fmtClock, fmtDate, fmtIso, nf, fmtMonthYearShort } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { attemptRows, timeTicks, wattsPoints } from './segment-data.ts';

/** One attempt, in date order (see SegmentPayload). */
export interface Attempt { ride: string; name: string; date: string; t: number; w: number | null; hr: number | null; pr: number | null }
type AttemptRow = Attempt & { i: number; best: number };

/** Tooltip lines every attempt shares: power, heart rate, PR rank. */
function extraLines(a: Attempt): TooltipLine[] {
  return [
    a.w ? { label: t('metric.watts'), color: 'var(--power)', value: `${Math.round(a.w)} W` } : null,
    a.hr ? { label: t('segments.attemptCols.hr'), color: 'var(--heart-rate)', value: `${Math.round(a.hr)} bpm` } : null,
    a.pr ? { label: 'PR', color: 'var(--brand)', value: t('segments.prRank', { n: a.pr }) } : null,
  ].filter((l): l is TooltipLine => l != null);
}

const attemptConfig = {
  t: { label: t('segments.attempt'), color: SERIES.segmentAttempt.color },
  best: { label: t('segments.bestSoFar'), color: SERIES.segmentBest.color },
} satisfies ChartConfig;

/** Time per attempt (linear – every attempt is a real measurement) and the best time so far (steps). */
export function AttemptsChart({ efforts }: { efforts: Attempt[] }) {
  const rows: AttemptRow[] = attemptRows(efforts);
  if (!rows.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  const { ticks, domain } = timeTicks(rows.map((r) => r.t));
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: AttemptRow }[] }) => {
    const r = active && payload?.[0]?.payload;
    if (!r) return null;
    return (
      <TooltipBox title={`${r.name} · ${fmtIso(r.date)}`} lines={[
        { label: attemptConfig.t.label, color: attemptConfig.t.color, value: fmtClock(r.t) },
        { label: attemptConfig.best.label, color: attemptConfig.best.color, value: fmtClock(r.best) },
        ...extraLines(r),
      ]} />
    );
  };
  // Day and month within a year; month and year when the attempts span several years
  const years = rows[0].date.slice(0, 4) !== rows.at(-1)!.date.slice(0, 4);
  const tick = (i: number) => {
    if (!rows[i]) return '';
    const d = new Date(`${rows[i].date}T00:00:00`);
    return years ? fmtMonthYearShort(d) : fmtDate(d);
  };
  return (
    <>
      <p className="sr-only">{`${t('segments.bestTime')} ${fmtClock(rows.at(-1)!.best)}, ${t('segments.attemptsN', { n: rows.length })}`}</p>
      <SeriesLegend items={[
        { label: attemptConfig.t.label, color: attemptConfig.t.color },
        { label: attemptConfig.best.label, color: attemptConfig.best.color, kind: 'dashed' },
      ]} />
      <ChartContainer config={attemptConfig} className="aspect-auto h-[300px] w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="i" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
          <YAxis reversed interval={0} tickLine={false} axisLine={false} width={52} ticks={ticks} domain={domain} tickFormatter={(v) => fmtClock(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <Line dataKey="best" type={SERIES.segmentBest.curve} stroke="var(--color-best)" strokeWidth={1.5} strokeDasharray={SERIES.segmentBest.dash} dot={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey="t" type={SERIES.segmentAttempt.curve} stroke="var(--color-t)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </>
  );
}

const wattsConfig = { w: { label: t('metric.watts'), color: SERIES.segmentWatts.color } } satisfies ChartConfig;

/** Watts vs. time: one point per attempt with power – does more power make it faster? */
export function WattsChart({ efforts }: { efforts: Attempt[] }) {
  const pts: Attempt[] = wattsPoints(efforts);
  if (!pts.length) return <EmptyState>{t('segments.fewPower')}</EmptyState>;
  const { ticks, domain } = timeTicks(pts.map((p) => p.t));
  const wTicks = niceTicks(Math.min(...pts.map((p) => p.w!)), Math.max(...pts.map((p) => p.w!)));
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Attempt }[] }) => {
    const p = active && payload?.[0]?.payload;
    if (!p) return null;
    return (
      <TooltipBox title={`${p.name} · ${fmtIso(p.date)}`} lines={[
        { label: t('segments.attemptCols.time'), color: SERIES.segmentAttempt.color, value: fmtClock(p.t) },
        ...extraLines(p),
      ]} />
    );
  };
  return (
    <>
      <p className="sr-only">{t('segments.wvtSub')}</p>
      <ChartContainer config={wattsConfig} className="aspect-auto h-[260px] w-full">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="w" name={t('metric.watts')} unit=" W" ticks={wTicks} domain={[wTicks[0], wTicks.at(-1)!]} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis type="number" dataKey="t" reversed interval={0} tickLine={false} axisLine={false} width={52} ticks={ticks} domain={domain} tickFormatter={(v) => fmtClock(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <Scatter data={pts} fill="var(--color-w)" fillOpacity={0.85} stroke="var(--card)" strokeWidth={1.5} isAnimationActive={false} />
        </ScatterChart>
      </ChartContainer>
    </>
  );
}

const elevConfig = { alt: { label: t('metric.altitude'), color: SERIES.streamElevation.color } } satisfies ChartConfig;

/** Elevation along the segment (a stream: linear). */
export function ElevationChart({ profile }: { profile: { km: number; alt: number }[] }) {
  if (profile.length < 2) return <EmptyState>{t('segments.noElev')}</EmptyState>;
  const alts = profile.map((p) => p.alt);
  const ticks = niceTicks(Math.min(...alts), Math.max(...alts), 4);
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: { km: number; alt: number } }[] }) => {
    const p = active && payload?.[0]?.payload;
    if (!p) return null;
    return <TooltipBox title={`${nf(p.km, 2)} km`} lines={[{ label: elevConfig.alt.label, color: elevConfig.alt.color, value: `${Math.round(p.alt)} m` }]} />;
  };
  return (
    <>
      <p className="sr-only">{`${elevConfig.alt.label}: ${Math.round(Math.min(...alts))}–${Math.round(Math.max(...alts))} m`}</p>
      <ChartContainer config={elevConfig} className="aspect-auto h-[260px] w-full">
        <AreaChart data={profile} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="fill-seg-elev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-alt)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-alt)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis type="number" dataKey="km" domain={[0, 'dataMax']} tickFormatter={(v) => `${nf(v, 1)} km`} tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={52} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} tickFormatter={(v) => `${nf(v)} m`} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <Area dataKey="alt" type={SERIES.streamElevation.curve} stroke="var(--color-alt)" strokeWidth={2} fill="url(#fill-seg-elev)" baseValue={ticks[0]} dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </>
  );
}
