import * as React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis, usePlotArea } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/app/EmptyState';
import { SERIES, niceTicks, zoneColor, type SeriesKey } from '@/components/charts/series';
import { zoneIdx } from '@/training/index.ts';
import { fmtClock, fmtHm, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { STREAM_SERIES, streamRows } from '@/lib/chart-streams.ts';
import { zoneBands } from './ride-data.ts';

type Key = 'watts' | 'hr' | 'cad' | 'kmh' | 'alt';
type Row = { i: number; t: number; km: number | null } & Partial<Record<Key, number | null>>;
type Zones = { min: number | null; max: number | null }[];
/** Zones that colour the power and heart-rate streams (the athlete's zones on the ride date, as on the route map). */
export type StreamZones = { watts: Zones | null; hr: Zones | null };

interface Spec { label: string; unit: string; series: SeriesKey; area?: boolean; height: number; dec: number; fromZero: boolean }
const SPEC: Record<Key, Spec> = {
  watts: { label: t('metric.power'), unit: 'W', series: 'streamPower', area: true, height: 130, dec: 0, fromZero: true },
  hr: { label: t('metric.heartRate'), unit: 'bpm', series: 'streamHeartRate', height: 96, dec: 0, fromZero: false },
  cad: { label: t('metric.cadence'), unit: 'rpm', series: 'streamCadence', height: 80, dec: 0, fromZero: true },
  kmh: { label: t('metric.speed'), unit: 'km/h', series: 'streamSpeed', height: 80, dec: 1, fromZero: true },
  alt: { label: t('metric.elevation'), unit: 'm', series: 'streamElevation', area: true, height: 96, dec: 0, fromZero: false },
};
const UNIT = Object.fromEntries(STREAM_SERIES.map((s) => [s.key, s.unit]));

/** Round time ticks (5 min … 2 h steps), about 8 of them. */
function timeTicks(end: number) {
  const step = [300, 600, 900, 1800, 3600, 7200].find((s) => end / s <= 8) ?? 7200;
  return Array.from({ length: Math.floor(end / step) + 1 }, (_, k) => k * step);
}

/** Colour of a stream value: its zone where the series is zoned and the zones are known, else the series colour. */
function valueColor(key: Key, value: number | null | undefined, zones: StreamZones) {
  const z = key === 'watts' || key === 'hr' ? zones[key] : null;
  return SERIES[SPEC[key].series].zoned && z?.length && value != null ? zoneColor(zoneIdx(value, z) + 1) : SERIES[SPEC[key].series].color;
}

/**
 * Vertical gradients in plot coordinates with a hard stop at every zone boundary of the value axis:
 * one path, every value drawn in the colour of its zone (stroke `#<id>`, fill `#<id>-fill`).
 */
function ZoneGradient({ id, zones, lo, hi }: { id: string; zones: Zones; lo: number; hi: number }) {
  const plot = usePlotArea();
  if (!plot) return null;
  const stops = zoneBands(zones, lo, hi).flatMap((b: { zone: number; from: number; to: number }) => [
    { offset: b.from, color: zoneColor(b.zone) },
    { offset: b.to, color: zoneColor(b.zone) },
  ]);
  const gradient = (gid: string, opacity: number) => (
    <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={plot.y} y2={plot.y + plot.height}>
      {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={opacity} />)}
    </linearGradient>
  );
  return <defs>{gradient(id, 1)}{gradient(`${id}-fill`, 0.16)}</defs>;
}

interface ChartsProps {
  rows: Row[];
  keys: Key[];
  zones: StreamZones;
  onMove: (index: number | null) => void;
}

/** The stacked stream charts, one per signal, hover synced. Memoised: the readout updates without redrawing them. */
const Charts = React.memo(function Charts({ rows, keys, zones, onMove }: ChartsProps) {
  const end = rows.at(-1)!.t;
  const xTicks = timeTicks(end);
  const move = (s: { activeTooltipIndex?: unknown; isTooltipActive?: boolean }) => onMove(s?.isTooltipActive && s.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : null);
  return (
    <div className="grid gap-1" onMouseLeave={() => onMove(null)}>
      {keys.map((key, k) => {
        const spec = SPEC[key];
        const style = SERIES[spec.series];
        const last = k === keys.length - 1;
        const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
        const ticks = niceTicks(spec.fromZero ? 0 : Math.min(...vals), Math.max(...vals), 3);
        const config = { [key]: { label: spec.label, color: style.color } } satisfies ChartConfig;
        const gradient = `fill-stream-${key}`;
        const zoned = style.zoned && (key === 'watts' || key === 'hr') && zones[key]?.length ? zones[key]! : null;
        const zoneId = `zones-stream-${key}`;
        const stroke = zoned ? `url(#${zoneId})` : `var(--color-${key})`;
        const fill = zoned ? `url(#${zoneId}-fill)` : `url(#${gradient})`;
        return (
          <div key={key} data-stream={key} className="grid items-start gap-1 sm:grid-cols-[4.5rem_1fr] sm:gap-2">
            <span className="flex items-baseline gap-1.5 text-xs text-muted-foreground sm:block sm:pt-1">
              {spec.label}
              <span className="font-mono text-[10px] sm:block">{spec.unit}</span>
            </span>
            <ChartContainer config={config} className="aspect-auto w-full" style={{ height: spec.height + (last ? 24 : 0) }}>
              <ComposedChart data={rows} syncId="ride-streams" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} onMouseMove={move} accessibilityLayer={false}>
                {zoned && <ZoneGradient id={zoneId} zones={zoned} lo={ticks[0]} hi={ticks.at(-1)!} />}
                {spec.area && !zoned && (
                  <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                )}
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="t" type="number" domain={[0, end]} ticks={xTicks} tickFormatter={fmtHm} hide={!last} height={last ? 24 : 0} tickLine={false} axisLine={false} tickMargin={6} />
                <YAxis tickLine={false} axisLine={false} width={40} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} tickFormatter={(v) => nf(v)} />
                <ChartTooltip content={() => null} cursor={{ style: { stroke: 'var(--muted-foreground)', strokeWidth: 1 } }} isAnimationActive={false} />
                {spec.area
                  ? <Area dataKey={key} type={style.curve} stroke={stroke} strokeWidth={1.25} fill={fill} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  : <Line dataKey={key} type={style.curve} stroke={stroke} strokeWidth={1.25} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
              </ComposedChart>
            </ChartContainer>
          </div>
        );
      })}
    </div>
  );
});

/** Values at the hovered moment, above the charts. */
function Readout({ row, keys, zones }: { row: Row | null; keys: Key[]; zones: StreamZones }) {
  return (
    <div className="mb-3 flex min-h-5 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs" data-testid="stream-readout" aria-hidden="true">
      {row ? (
        <>
          <span className="font-mono font-medium tabular-nums">{fmtClock(row.t, true)}{row.km != null && ` · ${nf(row.km, 1)} km`}</span>
          {keys.map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: valueColor(key, row[key], zones) }} />
              <span className="font-mono tabular-nums">{row[key] == null ? '–' : nf(row[key], SPEC[key].dec)} {UNIT[key]}</span>
            </span>
          ))}
        </>
      ) : (
        <span className="text-muted-foreground">{t('ride.streamsHint')}</span>
      )}
    </div>
  );
}

export interface StreamChartsProps {
  /** The ride's streams (Strava stream JSON). */
  stream: any;
  zones: StreamZones;
  /** Hovered sample index of the full stream (null = none) – e.g. for the map marker. */
  onHover?: (sample: number | null) => void;
}

/**
 * Power, heart rate, cadence, speed and elevation over the ride: linear (every point a measurement),
 * stacked with one shared hover, downsampled for display so long rides stay responsive. Power and
 * heart rate in the colour of their zones, the rest grey.
 */
export function StreamCharts({ stream, zones, onHover }: StreamChartsProps) {
  const { rows, keys } = React.useMemo(() => streamRows(stream) as { rows: Row[]; keys: Key[] }, [stream]);
  const [active, setActive] = React.useState<number | null>(null);
  const hover = React.useRef(onHover);
  hover.current = onHover;
  const frame = React.useRef(0);
  const onMove = React.useCallback((index: number | null) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setActive(index);
      hover.current?.(index == null ? null : rows[index]?.i ?? null);
    });
  }, [rows]);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);
  if (!rows.length || !keys.length) return <EmptyState>{t('common.noStreams')}</EmptyState>;
  const avg = (key: Key) => {
    const v = rows.map((r) => r[key]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return (
    <>
      <p className="sr-only">
        {`${t('ride.streamsLength', { t: fmtClock(rows.at(-1)!.t, true) })}: ${keys.map((k) => `${SPEC[k].label} ⌀ ${nf(avg(k), SPEC[k].dec)} ${UNIT[k]}`).join(', ')}`}
      </p>
      <Readout row={active == null ? null : rows[active] ?? null} keys={keys} zones={zones} />
      <Charts rows={rows} keys={keys} zones={zones} onMove={onMove} />
    </>
  );
}
