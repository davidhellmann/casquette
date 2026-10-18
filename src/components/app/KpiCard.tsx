import * as React from 'react';
import { Area, AreaChart, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { SERIES, type SeriesKey } from '@/components/charts/series';
import { nf } from '@/scripts/format.ts';

export interface KpiCardProps {
  label: string;
  /** A number (formatted with `decimals`) or a preformatted value such as a time; null = "–". */
  value: number | string | null | undefined;
  /** Decimal places of a numeric value. */
  decimals?: number;
  unit?: string;
  /** Change badge (top right); omitted for figures without a comparison. */
  delta?: React.ReactNode;
  secondary?: React.ReactNode;
  /** Values per bucket of the period; null = no data in that bucket. Without `series` the card has no sparkline area. */
  spark?: (number | null)[];
  /** The data meaning: picks the sparkline's shape (`SERIES`); the sparkline itself is always pink. */
  series?: SeriesKey;
  /** Start the sparkline's scale at zero (counts and sums) instead of the minimum (averages). */
  fromZero?: boolean;
}

/** A key figure: label, value with unit, change, context line and – with `spark` and `series` – a soft pink sparkline. */
export function KpiCard({ label, value, decimals = 0, unit, delta, secondary, spark, series, fromZero = false }: KpiCardProps) {
  const style = series ? { color: 'var(--brand)', curve: SERIES[series].curve } : null;
  const data = (spark || []).map((v, i) => ({ i, v }));
  const gradient = `kpi-${React.useId().replace(/:/g, '')}`;
  const shown = value == null || value === '' ? null : typeof value === 'number' ? nf(value, decimals) : value;
  return (
    <Card className={`relative min-w-0 gap-1 overflow-hidden ${style ? 'pb-0' : ''}`} data-slot="kpi-card">
      <div className="flex items-start justify-between gap-2 px-4 sm:px-5">
        <h3 className="font-mono text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</h3>
        {delta}
      </div>
      <p className="truncate px-4 text-2xl font-semibold tracking-tight tabular-nums sm:px-5 sm:text-3xl">
        {shown ?? '–'}
        {unit && shown != null && <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
      {secondary && <p className="px-4 text-xs text-muted-foreground sm:px-5">{secondary}</p>}
      {style && <div className="mt-2 h-12" aria-hidden="true">
        {data.filter((d) => d.v != null).length >= 2 && (
          <AreaChart width={400} height={48} data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} style={{ width: "100%", height: "100%" }} responsive accessibilityLayer={false}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={style.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={style.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[fromZero ? 0 : 'dataMin', 'dataMax']} />
            <Area dataKey="v" type={style.curve} stroke={style.color} strokeWidth={1.75} fill={`url(#${gradient})`} connectNulls isAnimationActive={false} />
          </AreaChart>
        )}
      </div>}
    </Card>
  );
}
