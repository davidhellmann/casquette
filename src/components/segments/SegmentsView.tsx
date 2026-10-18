import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { CardLabel } from '@/components/app/CardLabel';
import { DataTable, dataTableColumns, numeric, numSort, type DataTableColumn } from '@/components/app/DataTable';
import { routes } from '@/lib/routes.ts';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card';
import { SegmentedToggle } from '@/components/app/SegmentedToggle';
import { fmtClock, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { KpiCard } from '@/components/app/KpiCard';
import { DeltaToBest, isoDate } from './parts';
import { useIslandReady } from '@/lib/island-ready';

/** One segment as a table row. Optional values are undefined (sorted last). */
export interface SegmentRow {
  id: string;
  name: string;
  city: string;
  km: number;
  grade?: number;
  attempts: number;
  /** Best time in seconds. */
  best?: number;
  /** Average watts of the best-time attempt. */
  bestW?: number;
  bestOn?: string;
  last?: string;
  /** Last attempt vs. best time in percent (segments with ≥ 2 attempts). */
  lastDelta?: number;
  climb: boolean;
  virtual: boolean;
  /** Has its own page (≥ 2 attempts). */
  page: boolean;
  /** Segment on Strava (real Strava ids only). */
  strava: string | null;
}

/** Build payload of /segments (src/pages/segments/index.astro). */
export interface SegmentsPayload {
  climbs: number;
  attempts: number;
  prs: number;
  fav: { id: string; name: string; n: number; page: boolean } | null;
  rows: SegmentRow[];
}

type Filter = 'all' | 'multi' | 'climb' | 'virtual';
const FILTERS: Filter[] = ['all', 'multi', 'climb', 'virtual'];
const keep: Record<Filter, (r: SegmentRow) => boolean> = {
  all: () => true,
  multi: (r) => r.attempts >= 2,
  climb: (r) => r.climb,
  virtual: (r) => r.virtual,
};

const href = routes.segment;

function SegmentName({ r }: { r: SegmentRow }) {
  const name = r.page ? (
    <a href={href(r.id)} className="truncate font-medium hover:underline focus-visible:underline" title={r.name}>{r.name}</a>
  ) : r.strava ? (
    <a href={r.strava} target="_blank" rel="noopener" className="inline-flex min-w-0 items-center gap-1 font-medium hover:underline focus-visible:underline" title={r.name}>
      <span className="truncate">{r.name}</span><ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <span className="truncate font-medium" title={r.name}>{r.name}</span>
  );
  return (
    <div className="flex max-w-[22rem] min-w-0 flex-col">
      {name}
      {r.city && <span className="truncate text-xs text-muted-foreground">{r.city}</span>}
    </div>
  );
}

const col = dataTableColumns<SegmentRow>();
const L = (k: string) => t(`segments.cols.${k}`);
const dash = (v: number | undefined, f: (v: number) => string) => (v == null ? '–' : f(v));

const columns = col.columns([
  col.accessor('name', { id: 'name', meta: { label: L('n') }, sortFn: 'text', sortDescFirst: false, cell: (c) => <SegmentName r={c.row.original} /> }),
  col.accessor('km', { id: 'km', meta: numeric(L('k')), ...numSort, cell: (c) => `${nf(c.getValue(), 2)} km` }),
  col.accessor('grade', { id: 'grade', meta: numeric(L('gr')), ...numSort, cell: (c) => dash(c.getValue(), (v) => `${nf(v, 1)} %`) }),
  col.accessor('attempts', { id: 'attempts', meta: numeric(L('a')), ...numSort, cell: (c) => <b className="font-semibold">{c.getValue()}</b> }),
  col.accessor('best', { id: 'best', meta: numeric(L('b')), ...numSort, cell: (c) => dash(c.getValue(), fmtClock) }),
  col.accessor('bestW', { id: 'bestW', meta: numeric(L('bw')), ...numSort, cell: (c) => dash(c.getValue(), (v) => `${Math.round(v)} W`) }),
  col.accessor('bestOn', { id: 'bestOn', meta: { label: L('bd') }, ...numSort, cell: (c) => isoDate(c.getValue()) }),
  col.accessor('last', { id: 'last', meta: { label: L('l') }, ...numSort, cell: (c) => isoDate(c.getValue()) }),
  col.accessor('lastDelta', { id: 'lastDelta', meta: numeric(L('ld')), ...numSort, sortDescFirst: false, cell: (c) => <DeltaToBest pct={c.getValue()} /> }),
]) as DataTableColumn<SegmentRow>[];

const getRowId = (r: SegmentRow) => r.id;
const rowHref = (r: SegmentRow) => (r.page ? href(r.id) : undefined);
const searchText = (r: SegmentRow) => `${r.name} ${r.city}`;
const summary = (rows: SegmentRow[]) => t('segments.count', { n: nf(rows.length) });
const SORT = [{ id: 'attempts', desc: true }];

// Segmented look, as the period control in the page header

/** Segments (new UI): key figures and every segment as a sortable, searchable table. */
export function SegmentsView({ P }: { P: SegmentsPayload }) {
  useIslandReady();
  const [filter, setFilter] = React.useState<Filter>('all');
  const rows = React.useMemo(() => P.rows.filter(keep[filter]), [P.rows, filter]);
  const { fav } = P;
  return (
    <div className="grid gap-3 pb-8" data-testid="segments">
      <h1 className="sr-only">{t('segments.title')}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{t('segments.intro')}</p>
      <h2 className="sr-only">{t('segments.keyFigures')}</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="segment-kpis">
        <KpiCard label={t('segments.title')} value={nf(P.rows.length)} secondary={t('segments.climbs', { n: P.climbs })} />
        <KpiCard label={t('segments.attempts')} value={nf(P.attempts)} />
        <KpiCard label={t('segments.prs')} value={nf(P.prs)} secondary={t('segments.prsSub')} />
        <KpiCard
          label={t('segments.mostRidden')}
          value={fav ? nf(fav.n) : null}
          unit={fav ? t('segments.attemptsUnit', { n: fav.n }) : undefined}
          secondary={fav && (fav.page ? <a href={href(fav.id)} className="hover:underline focus-visible:underline">{fav.name}</a> : fav.name)}
        />
      </div>
      <Card>
        <CardHeader>
          <CardLabel as="h2">{t('segments.title')}</CardLabel>
          <CardAction className="max-sm:col-start-1 max-sm:row-start-2 max-sm:justify-self-start">
            <SegmentedToggle value={filter} onChange={setFilter} label={t('segments.filterLabel')} options={FILTERS.map((f) => ({ value: f, label: t(`segments.filter.${f}`) }))} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable
            label={t('segments.title')}
            columns={columns}
            data={rows}
            getRowId={getRowId}
            rowHref={rowHref as (r: SegmentRow) => string}
            initialSorting={SORT}
            searchText={searchText}
            searchLabel={t('segments.searchLabel')}
            searchPlaceholder={t('segments.search')}
            empty={t('segments.noneFound')}
            summary={summary}
          />
        </CardContent>
      </Card>
    </div>
  );
}
