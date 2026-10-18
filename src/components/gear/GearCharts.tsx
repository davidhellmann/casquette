import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, barRadius, niceTicks } from '@/components/charts/series';
import { SeriesLegend, TooltipBox } from '@/components/charts/chart-parts';
import { rideTypeColor } from '@/components/charts/categories';
import { curveLabel, monthLabel, monthTick, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

const DISTANCE = SERIES.distance.color;

const km = (v: number) => `${nf(v)} km`;
const ROUNDED: [number, number, number, number] = [3, 3, 0, 0];

type TipProps<R> = { active?: boolean; payload?: { payload: R }[] };

/** Kilometres per year (rounded bars), the current year in full colour. */
export function YearBars({ years, currentYear, height = 240, decorative = false }: { years: { year: number; km: number }[]; currentYear: number; height?: number; decorative?: boolean }) {
  if (!years.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  const config = { km: { label: 'km', color: DISTANCE } } satisfies ChartConfig;
  const Tip = ({ active, payload }: TipProps<{ year: number; km: number }>) => {
    const row = active && payload?.[0]?.payload;
    return row ? <TooltipBox title={String(row.year)} lines={[{ label: t('gear.perYear'), color: DISTANCE, value: km(row.km) }]} /> : null;
  };
  if (decorative) {
    return (
      <div aria-hidden="true" style={{ height }}>
        <BarChart width={300} height={height} data={years} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} style={{ width: '100%', height: '100%' }} responsive accessibilityLayer={false}>
          <XAxis dataKey="year" tickLine={false} axisLine={false} interval="preserveStartEnd" tickMargin={4} height={18} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          <YAxis hide domain={[0, 'dataMax']} />
          <Bar dataKey="km" radius={barRadius(years.length)} maxBarSize={28} isAnimationActive={false} minPointSize={2}>
            {years.map((y) => <Cell key={y.year} fill={DISTANCE} fillOpacity={y.year === currentYear ? 1 : 0.4} />)}
          </Bar>
        </BarChart>
      </div>
    );
  }
  const ticks = niceTicks(0, Math.max(...years.map((y) => y.km)));
  return (
    <>
      <p className="sr-only">{years.map((y) => `${y.year}: ${km(y.km)}`).join(', ')}</p>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart data={years} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          <Bar dataKey="km" radius={barRadius(years.length)} maxBarSize={64} isAnimationActive={false}>
            {years.map((y) => <Cell key={y.year} fill={DISTANCE} fillOpacity={y.year === currentYear ? 1 : 0.55} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </>
  );
}

/** Kilometres per month (rounded bars), the current month in full colour. */
export function MonthBars({ months }: { months: { key: string; km: number }[] }) {
  if (!months.some((m) => m.km > 0)) return <EmptyState>{t('common.noData')}</EmptyState>;
  const config = { km: { label: 'km', color: DISTANCE } } satisfies ChartConfig;
  const Tip = ({ active, payload }: TipProps<{ key: string; km: number }>) => {
    const row = active && payload?.[0]?.payload;
    return row ? <TooltipBox title={monthLabel(row.key)} lines={[{ label: t('gear.perMonth'), color: DISTANCE, value: km(row.km) }]} /> : null;
  };
  const ticks = niceTicks(0, Math.max(...months.map((m) => m.km)));
  const last = months.length - 1;
  return (
    <>
      <p className="sr-only">{months.filter((m) => m.km > 0).map((m) => `${monthLabel(m.key)}: ${km(m.km)}`).join(', ')}</p>
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={months} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="key" tickFormatter={monthTick} tickLine={false} axisLine={false} minTickGap={24} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          <Bar dataKey="km" radius={barRadius(months.length)} isAnimationActive={false}>
            {months.map((m, i) => <Cell key={m.key} fill={DISTANCE} fillOpacity={i === last ? 1 : 0.55} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </>
  );
}

/** Kilometres per ride type as a donut with the total in the middle. */
export function TypeChart({ types }: { types: { type: string; km: number }[] }) {
  if (!types.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  const total = types.reduce((s, x) => s + x.km, 0);
  const label = (type: string) => t(`gear.types.${type}`);
  const config = Object.fromEntries(types.map((x) => [x.type, { label: label(x.type), color: rideTypeColor(x.type) }])) satisfies ChartConfig;
  const share = (v: number) => `${km(v)} · ${nf((v / total) * 100)} %`;
  const Tip = ({ active, payload }: TipProps<{ type: string; km: number }>) => {
    const row = active && payload?.[0]?.payload;
    return row ? <TooltipBox title={label(row.type)} lines={[{ label: t('gear.usage'), color: rideTypeColor(row.type), value: share(row.km) }]} /> : null;
  };
  return (
    <>
      <p className="sr-only">{types.map((x) => `${label(x.type)}: ${share(x.km)}`).join(', ')}</p>
      <SeriesLegend items={types.map((x) => ({ label: label(x.type), color: rideTypeColor(x.type), kind: 'bar' }))} />
      <div className="relative">
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <PieChart>
            <ChartTooltip content={<Tip />} />
            <Pie data={types} dataKey="km" nameKey="type" innerRadius="66%" outerRadius="92%" paddingAngle={2} cornerRadius={2} stroke="none" isAnimationActive={false}>
              {types.map((x) => <Cell key={x.type} fill={rideTypeColor(x.type)} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className="text-lg font-semibold tabular-nums">{km(total)}</span>
          <span className="text-xs text-muted-foreground">{t('gear.synced')}</span>
        </div>
      </div>
    </>
  );
}

type BikeYearRow = { year: number } & Record<string, number>;

/** Kilometres per bike and year, stacked; only the top segment of each stack gets rounded corners. */
export function BikesPerYearChart({ bikes, rows }: { bikes: { id: string; name: string; color: string }[]; rows: BikeYearRow[] }) {
  if (!rows.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  const config = Object.fromEntries(bikes.map((b) => [b.id, { label: b.name, color: b.color }])) satisfies ChartConfig;
  const totals = rows.map((r) => bikes.reduce((s, b) => s + (r[b.id] || 0), 0));
  // The bike drawn last with kilometres in a year forms the top of that year's stack
  const top = rows.map((r) => [...bikes].reverse().find((b) => r[b.id] > 0)?.id);
  const ticks = niceTicks(0, Math.max(...totals));
  const Tip = ({ active, payload }: TipProps<BikeYearRow>) => {
    const row = active && payload?.[0]?.payload;
    if (!row) return null;
    const lines = bikes.filter((b) => row[b.id] > 0).sort((a, b) => row[b.id] - row[a.id])
      .map((b) => ({ label: b.name, color: config[b.id].color, value: km(row[b.id]) }));
    return <TooltipBox title={String(row.year)} lines={[...lines, { label: t('gear.total'), color: 'transparent', value: km(bikes.reduce((s, b) => s + (row[b.id] || 0), 0)) }]} />;
  };
  return (
    <>
      <p className="sr-only">{rows.map((r, i) => `${r.year}: ${km(totals[i])}`).join(', ')}</p>
      <SeriesLegend items={bikes.map((b) => ({ label: b.name, color: config[b.id].color, kind: 'bar' }))} />
      <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<Tip />} />
          {bikes.map((b) => (
            <Bar key={b.id} dataKey={b.id} stackId="km" fill={`var(--color-${b.id})`} maxBarSize={80} isAnimationActive={false}>
              {rows.map((r, i) => <Cell key={r.year} radius={(top[i] === b.id ? ROUNDED : 0) as any} />)}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </>
  );
}

type CurveRow = { s: number; w: number; wkg: number | null };

/** Best power over duration on this bike (monotone area); tooltip with watts and W/kg. */
export function GearCurveChart({ curve, wkg }: { curve: Record<string, number>; wkg: Record<string, number | null> }) {
  const rows: CurveRow[] = Object.keys(curve).map(Number).filter((s) => s >= 5).sort((a, b) => a - b).map((s) => ({ s, w: curve[s], wkg: wkg[s] ?? null }));
  if (!rows.length) return <EmptyState>{t('gear.noPower')}</EmptyState>;
  const config = { w: { label: t('gear.best'), color: SERIES.curveRecent.color } } satisfies ChartConfig;
  const value = (r: CurveRow) => `${nf(r.w)} W · ${nf(r.wkg, 2)} W/kg`;
  const Tip = ({ active, payload }: TipProps<CurveRow>) => {
    const row = active && payload?.[0]?.payload;
    return row ? <TooltipBox title={curveLabel(row.s)} lines={[{ label: config.w.label, color: config.w.color, value: value(row) }]} /> : null;
  };
  const ticks = niceTicks(0, Math.max(...rows.map((r) => r.w)));
  const summary = [300, 1200].map((s) => rows.find((r) => r.s === s)).filter(Boolean).map((r) => `${curveLabel(r!.s)}: ${value(r!)}`).join(', ');
  return (
    <>
      {summary && <p className="sr-only">{`${config.w.label} – ${summary}`}</p>}
      <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
        <AreaChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fill-gear-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-w)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-w)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="s" tickFormatter={curveLabel} tickLine={false} axisLine={false} minTickGap={16} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} ticks={ticks} domain={[0, ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<Tip />} />
          <Area dataKey="w" type={SERIES.curveRecent.curve} stroke="var(--color-w)" strokeWidth={2.25} fill="url(#fill-gear-curve)" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </>
  );
}
