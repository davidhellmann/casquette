import type * as React from 'react';
import { House } from 'lucide-react';
import { cn } from 'cn';
import { dataTableColumns, numeric, numSort, type DataTableColumn, type DataTableGrouping, type DataTableTiles } from '@/components/app/DataTable';
import type { GroupBy } from '@/components/app/table-groups';
import { classificationText } from '@/scripts/dashboard-display.js';
import { fmtDayMonth, fmtDur, fmtWeekday, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

/** One ride as a table row: the ride plus its period-dependent values (zone by basis, fuelling). */
export interface RideRow {
  id: string;
  href: string;
  date: Date;
  name: string;
  /** Names of the places the ride passed through, for the search. */
  places: string;
  indoor: boolean;
  /** E-bike type when the ride does not count towards statistics. */
  eBike: string | null;
  pr: number;
  km: number;
  time: number;
  elev: number;
  w?: number;
  np?: number;
  hr?: number;
  zone?: number;
  /** "Source: value" the zone was classified from. */
  zoneBy: string;
  tss?: number;
  /** Carbohydrates per hour. */
  fuel?: number;
}

const num = (v: number | null | undefined) => (v == null ? undefined : v);

/** Ride-log rows for one dashboard period (D.log) and zone basis. */
export function rideRows(D: any, basis: 'power' | 'hr', base: string): RideRow[] {
  return D.log.map((r: any): RideRow => {
    const c = basis === 'hr' ? r.clsH : r.clsP;
    const { src, val } = classificationText(r, c);
    return {
      id: r.id,
      href: `${base}rides/${r.id}`,
      date: r.d,
      name: r.name || '',
      places: r.geo?.places.map((p: { name: string }) => p.name).join(' · ') || '',
      indoor: !!r.indoor,
      eBike: r.stats ? null : r.sport_type === 'EMountainBikeRide' ? 'E-MTB' : 'E-Bike',
      pr: r.pr || 0,
      km: (r.distance || 0) / 1000,
      time: r.moving_time || 0,
      elev: r.elev || 0,
      w: num(r.w),
      np: num(r.np),
      hr: num(r.hr),
      zone: num(c.zone),
      zoneBy: `${src}: ${val}`,
      tss: num(r.tss),
      fuel: D.fueling[r.id]?.gph || undefined,
    };
  });
}

export const rideSearchText = (r: RideRow) => `${r.name} ${r.places}`;

// Literal class names, so Tailwind generates them
const ZONE_DOT = ['bg-zone-1', 'bg-zone-1', 'bg-zone-2', 'bg-zone-3', 'bg-zone-4', 'bg-zone-5', 'bg-zone-6', 'bg-zone-7'];

/** Zone as a small badge: a zone-coloured square and Z1–Z7 (or "?" when unclassified). */
export function ZoneBadge({ zone, title }: { zone?: number; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs" title={title}>
      <span className={cn('size-2 rounded-[2px]', zone ? ZONE_DOT[Math.min(zone, 7)] : 'bg-muted-foreground/40')} aria-hidden="true" />
      {zone ? `Z${zone}` : '?'}
    </span>
  );
}

/** A value with its unit small and muted after it. */
export function WithUnit({ value, unit }: { value: React.ReactNode; unit?: string }) {
  return <>{value}{unit && <span className="ml-1 font-mono text-[11px] text-muted-foreground">{unit}</span>}</>;
}
/** A duration ("4:30 h", "45 min") with its unit muted. */
const Dur = ({ s }: { s: number }) => {
  const [v, u] = fmtDur(s).split(' ');
  return <WithUnit value={v} unit={u} />;
};

/** PR count as a small pink-tinted chip. */
function PrChip({ n }: { n: number }) {
  return (
    <span className="shrink-0 rounded-sm bg-brand-surface px-1.5 py-px font-mono text-[10.5px] text-brand-surface-foreground" title={t('common.prs', { n })}>
      {t('log.prChip', { n })}
    </span>
  );
}

/** Two-line date: day and month (with the year on long lists), the weekday below. */
function RideDate({ d, longDate }: { d: Date; longDate: boolean }) {
  return (
    <div className="grid leading-tight" data-testid="date-cell">
      <span className="font-medium">{fmtDayMonth(d, longDate)}</span>
      <span className="text-xs text-muted-foreground">{fmtWeekday(d)}</span>
    </div>
  );
}

/** Two-line ride: name (link) with tags, the places or "Indoor" below. */
function RideName({ r, link = true }: { r: RideRow; link?: boolean }) {
  const sub = r.indoor ? t('common.indoor') : r.places;
  return (
    <div className="grid max-w-[22rem] min-w-0 leading-tight" data-testid="ride-cell">
      <div className="flex min-w-0 items-center gap-1.5">
        {link
          ? <a href={r.href} className="truncate font-medium hover:underline focus-visible:underline" title={r.name}>{r.name}</a>
          : <span className="truncate font-medium">{r.name}</span>}
        {r.eBike && <span className="shrink-0 rounded-sm bg-muted px-1 font-mono text-[10px] text-muted-foreground" title={t('log.statsTag')}>{r.eBike}</span>}
        {r.pr > 0 && <PrChip n={r.pr} />}
      </div>
      {sub && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="ride-sub">
          {r.indoor && <House className="size-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{sub}</span>
        </span>
      )}
    </div>
  );
}

const col = dataTableColumns<RideRow>();
const L = (k: string) => t(`log.cols.${k}`);
const dash = (v: number | undefined, f: (v: number) => React.ReactNode = (x) => nf(x)) => (v == null ? '–' : f(v));
const watts = (v: number) => <WithUnit value={Math.round(v)} unit="W" />;

export type RideColumnId = 'date' | 'name' | 'km' | 'time' | 'elev' | 'w' | 'np' | 'hr' | 'zone' | 'tss' | 'fuel';

/** Columns of the ride log; `longDate` adds the year to the date (periods longer than 3 months). */
export function rideColumns({ longDate, only }: { longDate: boolean; only?: RideColumnId[] }): DataTableColumn<RideRow>[] {
  const all = col.columns([
    col.accessor('date', {
      id: 'date', meta: { label: L('date') }, sortFn: 'datetime', sortDescFirst: true, enableHiding: false,
      cell: (c) => <RideDate d={c.getValue()} longDate={longDate} />,
    }),
    col.accessor('name', {
      id: 'name', meta: { label: L('name') }, sortFn: 'text', sortDescFirst: false, enableHiding: false,
      cell: (c) => <RideName r={c.row.original} />,
    }),
    col.accessor('km', { id: 'km', meta: numeric(L('km')), ...numSort, cell: (c) => <WithUnit value={nf(c.getValue(), 1)} unit="km" /> }),
    col.accessor('time', { id: 'time', meta: numeric(L('time')), ...numSort, cell: (c) => <Dur s={c.getValue()} /> }),
    col.accessor('elev', { id: 'elev', meta: numeric(L('elev')), ...numSort, cell: (c) => <WithUnit value={nf(c.getValue())} unit={t('units.elev')} /> }),
    col.accessor('w', { id: 'w', meta: numeric(L('w')), ...numSort, cell: (c) => dash(c.getValue(), watts) }),
    col.accessor('np', { id: 'np', meta: numeric(L('np')), ...numSort, cell: (c) => dash(c.getValue(), watts) }),
    col.accessor('hr', { id: 'hr', meta: numeric(L('hr')), ...numSort, cell: (c) => dash(c.getValue(), (v) => <WithUnit value={Math.round(v)} unit="bpm" />) }),
    col.accessor('zone', { id: 'zone', meta: { label: L('zone') }, ...numSort, cell: (c) => <ZoneBadge zone={c.getValue()} title={c.row.original.zoneBy} /> }),
    col.accessor('tss', { id: 'tss', meta: numeric(L('tss')), ...numSort, cell: (c) => dash(c.getValue()) }),
    col.accessor('fuel', { id: 'fuel', meta: numeric(L('fuel')), ...numSort, cell: (c) => dash(c.getValue(), (v) => <WithUnit value={v} unit="g/h" />) }),
  ]) as DataTableColumn<RideRow>[];
  return only ? all.filter((c) => only.includes(c.id as RideColumnId)) : all;
}

/* ---------------- Ride lists: grouping and tiles ---------------- */

const sum = (rows: RideRow[], f: (r: RideRow) => number) => rows.reduce((s, r) => s + f(r), 0);
/** Totals of a week or month: "123 km · 4:30 h". */
export const rideTotals = (rows: RideRow[]) => t('log.groupTotals', { km: nf(sum(rows, (r) => r.km)), time: fmtDur(sum(rows, (r) => r.time)) });

/** Week/month grouping of a ride list (by its date column). */
export const rideGrouping = (initial: GroupBy = 'none'): DataTableGrouping<RideRow> => ({
  column: 'date', dateOf: (r) => r.date, totals: rideTotals, label: t('log.group'), initial,
});

function TileFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap tabular-nums">{children}</dd>
    </div>
  );
}

/** One ride as a tile: date, name and place, four key figures (km, time, NP or avg W, zone + TSS). */
function RideTile({ r, longDate }: { r: RideRow; longDate: boolean }) {
  const T = (k: string) => t(`log.tile.${k}`);
  const power = r.np != null ? { label: T('np'), v: r.np } : { label: T('w'), v: r.w };
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 md:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
      <div className="grid leading-tight">
        <span className="text-sm font-medium">{fmtDayMonth(r.date)}</span>
        <span className="text-xs text-muted-foreground">{fmtWeekday(r.date)}{longDate ? ` ${r.date.getFullYear()}` : ''}</span>
      </div>
      <RideName r={r} link={false} />
      <dl className="col-span-2 grid grid-cols-4 gap-3 md:col-span-1 md:w-[22rem]">
        <TileFigure label={T('km')}>{nf(r.km, 1)}</TileFigure>
        <TileFigure label={T('time')}><Dur s={r.time} /></TileFigure>
        <TileFigure label={power.label}>{dash(power.v, watts)}</TileFigure>
        <TileFigure label={T('tss')}>
          {r.zoneBy && <ZoneBadge zone={r.zone} title={r.zoneBy} />}
          {dash(r.tss)}
        </TileFigure>
      </dl>
    </div>
  );
}

/** Tile view of a ride list. */
export const rideTiles = (longDate = false): DataTableTiles<RideRow> => ({ render: (r) => <RideTile r={r} longDate={longDate} /> });
