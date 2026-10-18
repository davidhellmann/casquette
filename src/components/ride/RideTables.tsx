import { ExternalLink } from 'lucide-react';
import { cn } from 'cn';
import { DataTable, dataTableColumns, numeric, numSort, type DataTableColumn } from '@/components/app/DataTable';
import { fmtClock, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

export interface Lap {
  index: number; name: string | null; distance: number | null; moving_time: number | null; average_speed: number | null;
  average_watts: number | null; average_heartrate: number | null; max_heartrate: number | null; average_cadence: number | null; total_elevation_gain: number | null;
}
export interface SegmentEffort {
  key: string; name: string | null; href: string | null; distance: number | null; average_grade: number | null; elapsed_time: number | null;
  average_watts: number | null; average_heartrate: number | null; pr_rank: number | null;
}
export interface Split {
  split: number; moving_time: number | null; average_speed: number | null; elevation_difference: number | null; average_heartrate: number | null;
}

const v = (x: number | null | undefined) => (x == null ? undefined : x);
const round = (x: number | undefined) => (x == null ? '–' : String(Math.round(x)));
const cols = (key: string) => t(key) as unknown as string[];

const lap = dataTableColumns<Lap>();
function lapColumns(): DataTableColumn<Lap>[] {
  const L = cols('ride.lapCols');
  return lap.columns([
    lap.accessor('index', { id: 'index', meta: numeric(L[0]), ...numSort }),
    lap.accessor((l) => l.name ?? '', { id: 'name', meta: { label: L[1] }, sortFn: 'text' }),
    lap.accessor((l) => v(l.distance), { id: 'distance', meta: numeric(L[2]), ...numSort, cell: (c) => `${nf((c.getValue() || 0) / 1000, 2)} km` }),
    lap.accessor((l) => v(l.moving_time), { id: 'time', meta: numeric(L[3]), ...numSort, cell: (c) => fmtClock(c.getValue()) }),
    lap.accessor((l) => v(l.average_speed), { id: 'speed', meta: numeric(L[4]), ...numSort, cell: (c) => nf((c.getValue() || 0) * 3.6, 1) }),
    lap.accessor((l) => v(l.average_watts), { id: 'watts', meta: numeric(L[5]), ...numSort, cell: (c) => round(c.getValue()) }),
    lap.accessor((l) => v(l.average_heartrate), { id: 'hr', meta: numeric(L[6]), ...numSort, cell: (c) => round(c.getValue()) }),
    lap.accessor((l) => v(l.max_heartrate), { id: 'maxHr', meta: numeric(L[7]), ...numSort, cell: (c) => round(c.getValue()) }),
    lap.accessor((l) => v(l.average_cadence), { id: 'cad', meta: numeric(L[8]), ...numSort, cell: (c) => round(c.getValue()) }),
    lap.accessor((l) => v(l.total_elevation_gain), { id: 'elev', meta: numeric(L[9]), ...numSort, cell: (c) => nf(c.getValue()) }),
  ]) as DataTableColumn<Lap>[];
}

// PR rank 1–3 as a small badge; literal class names for Tailwind
const RANK = ['', 'bg-brand-surface text-brand-surface-foreground', 'bg-muted text-foreground', 'bg-muted text-muted-foreground'];

const seg = dataTableColumns<SegmentEffort>();
function segmentColumns(): DataTableColumn<SegmentEffort>[] {
  const L = cols('ride.segCols');
  return seg.columns([
    seg.accessor((s) => s.name ?? '', {
      id: 'name', meta: { label: L[0] }, sortFn: 'text',
      cell: (c) => {
        const s = c.row.original;
        return (
          <span className="block max-w-[22rem] truncate" title={s.name ?? ''}>
            {s.href
              ? <a href={s.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium hover:underline focus-visible:underline">{s.name}<ExternalLink className="size-3 opacity-60" aria-hidden="true" /></a>
              : s.name}
          </span>
        );
      },
    }),
    seg.accessor((s) => v(s.distance), { id: 'distance', meta: numeric(L[1]), ...numSort, cell: (c) => `${nf((c.getValue() || 0) / 1000, 2)} km` }),
    seg.accessor((s) => v(s.average_grade), { id: 'grade', meta: numeric(L[2]), ...numSort, cell: (c) => (c.getValue() == null ? '–' : `${nf(c.getValue(), 1)} %`) }),
    seg.accessor((s) => v(s.elapsed_time), { id: 'time', meta: numeric(L[3]), ...numSort, cell: (c) => fmtClock(c.getValue()) }),
    seg.accessor((s) => (s.elapsed_time && s.distance != null ? (s.distance / s.elapsed_time) * 3.6 : undefined), { id: 'speed', meta: numeric(L[4]), ...numSort, cell: (c) => (c.getValue() == null ? '–' : nf(c.getValue(), 1)) }),
    seg.accessor((s) => v(s.average_watts), { id: 'watts', meta: numeric(L[5]), ...numSort, cell: (c) => round(c.getValue()) }),
    seg.accessor((s) => v(s.average_heartrate), { id: 'hr', meta: numeric(L[6]), ...numSort, cell: (c) => round(c.getValue()) }),
    seg.accessor((s) => v(s.pr_rank ?? undefined), {
      id: 'pr', meta: { label: L[7] }, ...numSort,
      cell: (c) => {
        const r = c.getValue();
        return r ? <span className={cn('inline-flex size-5 items-center justify-center rounded-sm font-mono text-[11px] font-medium', RANK[r] || RANK[3])}>{r}</span> : '';
      },
    }),
  ]) as DataTableColumn<SegmentEffort>[];
}

const split = dataTableColumns<Split>();
function splitColumns(): DataTableColumn<Split>[] {
  const L = cols('ride.splitCols');
  return split.columns([
    split.accessor('split', { id: 'split', meta: numeric(L[0]), ...numSort }),
    split.accessor((s) => v(s.moving_time), { id: 'time', meta: numeric(L[1]), ...numSort, cell: (c) => fmtClock(c.getValue()) }),
    split.accessor((s) => v(s.average_speed), { id: 'speed', meta: numeric(L[2]), ...numSort, cell: (c) => nf((c.getValue() || 0) * 3.6, 1) }),
    split.accessor((s) => v(s.elevation_difference), { id: 'elev', meta: numeric(L[3]), ...numSort, cell: (c) => `${nf(c.getValue(), 0)} m` }),
    split.accessor((s) => v(s.average_heartrate), { id: 'hr', meta: numeric(L[4]), ...numSort, cell: (c) => round(c.getValue()) }),
  ]) as DataTableColumn<Split>[];
}

const none = t('common.noData');

export const LapsTable = ({ laps }: { laps: Lap[] }) => (
  <DataTable label={t('ride.laps')} columns={lapColumns()} data={laps} getRowId={(l) => String(l.index)} initialSorting={[{ id: 'index', desc: false }]} pageSize={false} empty={none} />
);
export const SegmentsTable = ({ segments }: { segments: SegmentEffort[] }) => (
  <DataTable label={t('ride.segments')} columns={segmentColumns()} data={segments} getRowId={(s) => s.key} pageSize={false} empty={none} />
);
export const SplitsTable = ({ splits }: { splits: Split[] }) => (
  <DataTable label={t('ride.splits')} columns={splitColumns()} data={splits} getRowId={(s) => String(s.split)} initialSorting={[{ id: 'split', desc: false }]} pageSize={false} empty={none} />
);
