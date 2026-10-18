import { EmptyState } from '@/components/app/EmptyState';
import { POWER_ZONE_NAMES, HR_ZONE_NAMES } from '@/training/index.js';
import { fmtDur, nf, zr } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { zoneColor } from './series';

export interface ZoneRow { zone: number; name: string; range: string; sec: number }

/** A zone's swatch and label – the zone colour sits beside the text, never behind it (contrast). */
export function ZoneLabel({ zone, label = `Z${zone}` }: { zone: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: zoneColor(zone) }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** A horizontal bar (owned SVG) filled `from`…`from + width` percent in `color`. */
export function Bar({ from = 0, width, color, className = 'h-1.5' }: { from?: number; width: number; color: string; className?: string }) {
  return (
    <svg className={`w-full overflow-visible ${className}`} aria-hidden="true" data-slot="chart-svg">
      <rect width="100%" height="100%" rx={3} fill="var(--background)" />
      {width > 0 && <rect x={`${from}%`} width={`${Math.max(0.6, width)}%`} height="100%" rx={3} fill={color} />}
    </svg>
  );
}

/**
 * Time per zone (owned SVG bars): zone, name and range, share of the total, and the duration.
 * `compact` leaves out the duration (narrow side panels).
 */
export function ZoneBars({ rows, total, compact = false }: { rows: ZoneRow[]; total: number; compact?: boolean }) {
  return (
    <ul className="grid gap-2">
      {rows.map((r) => {
        const p = total ? (r.sec / total) * 100 : 0;
        return (
          <li key={r.zone} data-slot="zone-bar" className={`grid items-center gap-x-3 text-xs ${compact ? 'grid-cols-[2.25rem_minmax(0,1fr)_2.5rem] gap-y-1' : 'grid-cols-[2.25rem_minmax(0,1fr)_2.5rem_3.5rem] gap-y-1 sm:grid-cols-[2.25rem_minmax(0,12rem)_minmax(0,1fr)_2.5rem_3.5rem]'}`}>
            <ZoneLabel zone={r.zone} />
            <span className="min-w-0 truncate">
              {r.name} <span className="text-muted-foreground">· {r.range}</span>
            </span>
            {/* Narrow screens: the bar on its own line under the name */}
            {!compact && <span className="order-last col-span-3 col-start-2 sm:order-none sm:col-span-1 sm:col-start-auto"><Bar width={p} color={zoneColor(r.zone)} /></span>}
            <span className="text-right font-mono tabular-nums">{nf(p, 0)}%</span>
            {!compact && <span className="text-right font-mono text-muted-foreground tabular-nums">{fmtDur(r.sec)}</span>}
            {compact && <span className="col-span-3"><Bar width={p} color={zoneColor(r.zone)} className="h-1" /></span>}
          </li>
        );
      })}
    </ul>
  );
}

export interface TimeInZonesProps {
  /** Seconds per zone. */
  seconds?: number[] | null;
  /** Zone boundaries ([{min,max}]), null when not stored. */
  zones?: { min: number | null; max: number | null }[] | null;
  kind: 'power' | 'hr';
}

/** Time in zones of a ride or a year from stored seconds per zone: `ZoneBars` with zone names and ranges, or an empty state. */
export function TimeInZones({ seconds, zones, kind }: TimeInZonesProps) {
  const names: string[] = kind === 'hr' ? HR_ZONE_NAMES : POWER_ZONE_NAMES;
  const unit = kind === 'hr' ? 'bpm' : 'W';
  const arr = (seconds || []).slice(0, zones?.length ?? names.length);
  const total = arr.reduce((a, b) => a + b, 0);
  if (!total) return <EmptyState>{t('zones.noStreams', { kind: t(kind === 'hr' ? 'metric.heartRate' : 'metric.power').toLowerCase() })}</EmptyState>;
  const rows = arr.map((sec, i) => ({ zone: i + 1, name: names[i], range: zones?.[i] ? zr(zones[i], unit) : t('zones.noBoundaries'), sec }));
  return <ZoneBars rows={rows} total={total} />;
}

/** Shares side by side in one bar (owned SVG), each segment with its own colour and a title. */
export function ShareStrip({ segments, className = 'h-2.5' }: { segments: { key: string | number; value: number; color: string; title: string }[]; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let x = 0;
  return (
    <svg className={`w-full ${className}`} aria-hidden="true" data-slot="chart-svg">
      <rect width="100%" height="100%" rx={3} fill="var(--background)" />
      {segments.map((s) => {
        const w = (s.value / total) * 100, at = x;
        x += w;
        return w > 0 ? <rect key={s.key} x={`${at}%`} width={`${w}%`} height="100%" fill={s.color} stroke="var(--card)" strokeWidth={1.5}><title>{s.title}</title></rect> : null;
      })}
    </svg>
  );
}
