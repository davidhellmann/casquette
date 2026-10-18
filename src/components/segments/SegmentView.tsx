import * as React from 'react';
import { ExternalLink, Map as MapIcon } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { DataTable, dataTableColumns, numeric, numSort, type DataTableColumn } from '@/components/app/DataTable';
import { EmptyState } from '@/components/app/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtClock, fmtIso, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { AttemptsChart, ElevationChart, WattsChart, type Attempt } from './SegmentCharts';
import { SegmentMap } from './SegmentMap';
import { KpiCard } from '@/components/app/KpiCard';
import { DeltaToBest, PrRank, isoDate } from './parts';
import { prHistory, segmentTrack } from './segment-data.ts';
import { useIslandReady } from '@/lib/island-ready';
import { chartStreams } from '@/lib/chart-streams.ts';
import { routes } from '@/lib/routes.ts';

/** An attempt with everything the table shows. */
export interface SegmentAttempt extends Attempt { cad: number | null; kg: number; bike: string | null }
interface Effort { date: string; t: number }

/** Build payload of /segments/<id> (src/pages/segments/[id].astro). */
export interface SegmentPayload {
  id: string;
  name: string;
  /** Place, "Virtual", climb category. */
  tags: string[];
  /** Metres. */
  distance: number;
  grade: number | null;
  strava: string | null;
  best: Effort;
  bestSpeed: number;
  median: number;
  last: Effort;
  lastDelta: number | null;
  first: Effort;
  improvement: number | null;
  bestW: number | null;
  bestWkg: number | null;
  prs: number;
  /** Date order. */
  efforts: SegmentAttempt[];
  /** Fastest attempts with second-by-second data (stream indexes of the segment). */
  tracks: { ride: string; si: number; ei: number }[];
}

type Track = NonNullable<ReturnType<typeof segmentTrack>>;
const S = (key: string, p?: Record<string, unknown>) => t(`segments.${key}`, p);
const rideHref = routes.ride;

/** The segment cut out of the first of `tracks` whose stream file loads; null = none, undefined = loading. */
function useSegmentTrack(tracks: SegmentPayload['tracks'], distance: number) {
  const [track, setTrack] = React.useState<Track | null | undefined>(tracks.length ? undefined : null);
  React.useEffect(() => {
    if (!tracks.length) return;
    let gone = false;
    (async () => {
      for (const tr of tracks) {
        const st = await chartStreams.load(tr.ride);
        const cut = st && segmentTrack(st, tr, distance);
        if (cut) { if (!gone) setTrack(cut); return; }
      }
      if (!gone) setTrack(null);
    })();
    return () => { gone = true; };
  }, [tracks, distance]);
  return track;
}

function kpis(S_: SegmentPayload) {
  const { best, last, first, lastDelta } = S_;
  return [
    { key: 'best', label: S('bestTime'), value: fmtClock(best.t), secondary: `${fmtIso(best.date)} · ${nf(S_.bestSpeed, 1)} km/h` },
    { key: 'median', label: S('median'), value: fmtClock(S_.median), secondary: S('fromN', { n: S_.efforts.length }) },
    {
      key: 'last', label: S('lastAttempt'), value: fmtClock(last.t),
      secondary: `${fmtIso(last.date)}${lastDelta == null ? '' : ` · ${lastDelta <= 0.05 ? S('bestBang') : S('toBest', { v: nf(lastDelta, 1) })}`}`,
    },
    { key: 'improvement', label: S('improvement'), value: S_.improvement == null ? null : nf(S_.improvement, 1), unit: '%', secondary: S('sinceFirst', { d: fmtIso(first.date) }) },
    { key: 'power', label: S('bestPower'), value: S_.bestW ? nf(S_.bestW) : null, unit: 'W', secondary: S_.bestW ? `${nf(S_.bestWkg, 2)} W/kg` : S('noPower') },
    { key: 'prs', label: S('prPlacements'), value: nf(S_.prs), secondary: S('prPlacementsSub') },
  ];
}

const col = dataTableColumns<SegmentAttempt>();
const C = (k: string) => S(`attemptCols.${k}`);
const whole = (v: number | null) => (v == null ? '–' : String(Math.round(v)));
const nullsLast = <T,>(v: T | null) => v ?? undefined;

function attemptColumns(distance: number, bestTime: number): DataTableColumn<SegmentAttempt>[] {
  return col.columns([
    col.accessor('date', { id: 'date', meta: { label: C('date') }, ...numSort, cell: (c) => isoDate(c.getValue()) }),
    col.accessor('name', {
      id: 'ride', meta: { label: C('ride') }, sortFn: 'text', sortDescFirst: false,
      cell: (c) => <a href={rideHref(c.row.original.ride)} className="block max-w-[18rem] truncate font-medium hover:underline focus-visible:underline" title={c.getValue()}>{c.getValue()}</a>,
    }),
    col.accessor('t', { id: 'time', meta: numeric(C('time')), sortFn: 'basic', sortDescFirst: false, cell: (c) => <b className="font-semibold">{fmtClock(c.getValue())}</b> }),
    col.accessor((r) => (distance / r.t) * 3.6, { id: 'kmh', meta: numeric(C('kmh')), ...numSort, cell: (c) => nf(c.getValue(), 1) }),
    col.accessor((r) => nullsLast(r.w), { id: 'w', meta: numeric(C('w')), ...numSort, cell: (c) => whole(c.getValue() ?? null) }),
    col.accessor((r) => (r.w != null ? r.w / r.kg : undefined), { id: 'wkg', meta: numeric(C('wkg')), ...numSort, cell: (c) => (c.getValue() == null ? '–' : nf(c.getValue(), 2)) }),
    col.accessor((r) => nullsLast(r.hr), { id: 'hr', meta: numeric(C('hr')), ...numSort, cell: (c) => whole(c.getValue() ?? null) }),
    col.accessor((r) => nullsLast(r.cad), { id: 'cad', meta: numeric(C('cad')), ...numSort, cell: (c) => whole(c.getValue() ?? null) }),
    col.accessor((r) => ((r.t - bestTime) / bestTime) * 100, { id: 'delta', meta: numeric(C('delta')), sortFn: 'basic', sortDescFirst: false, cell: (c) => <DeltaToBest pct={c.getValue()} /> }),
    col.accessor((r) => nullsLast(r.pr), { id: 'pr', meta: { label: C('pr') }, sortFn: 'basic', sortDescFirst: false, sortUndefined: 'last', cell: (c) => <PrRank rank={c.getValue()} /> }),
    col.accessor((r) => r.bike || '', { id: 'bike', meta: { label: C('bike') }, sortFn: 'text', sortDescFirst: false, cell: (c) => c.getValue() || '–' }),
  ]) as DataTableColumn<SegmentAttempt>[];
}

/** Seconds gained: "7 s", "2:54" from a minute on. */
const fmtGain = (s: number) => (s < 60 ? `${nf(s)} s` : fmtClock(s));

function PrHistory({ efforts }: { efforts: Attempt[] }) {
  const list = prHistory(efforts);
  return (
    <ol className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-3" data-testid="pr-history">
      {list.map((p: ReturnType<typeof prHistory>[number]) => (
        <li key={`${p.ride}-${p.date}`} className="col-span-4 grid grid-cols-subgrid items-baseline rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmtIso(p.date)}</span>
          <a href={rideHref(p.ride)} className="truncate hover:underline focus-visible:underline" title={p.name}>{p.name}</a>
          <span className="text-right font-mono font-semibold tabular-nums">{fmtClock(p.t)}</span>
          <span className="text-right font-mono text-xs whitespace-nowrap text-positive tabular-nums">{p.gain == null ? S('firstBest') : S('gain', { v: fmtGain(p.gain) })}</span>
        </li>
      ))}
    </ol>
  );
}

const getRowId = (r: SegmentAttempt) => `${r.ride}-${r.date}-${r.t}`;
const rowHref = (r: SegmentAttempt) => rideHref(r.ride);
const SORT = [{ id: 'date', desc: true }];

/** Segment detail (new UI): key figures, attempts, PR history, map, watts vs. time, elevation, all attempts. */
export function SegmentView({ S: seg }: { S: SegmentPayload }) {
  useIslandReady();
  const track = useSegmentTrack(seg.tracks, seg.distance);
  const columns = React.useMemo(() => attemptColumns(seg.distance, seg.best.t), [seg.distance, seg.best.t]);
  const n = seg.efforts.length;
  const loading = <Skeleton className="h-[260px] w-full rounded-md" aria-busy="true" />;
  return (
    <div className="grid gap-3 pb-8" data-testid="segment">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{seg.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {seg.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          <Badge variant="outline">{nf(seg.distance / 1000, 2)} km</Badge>
          {seg.grade != null && <Badge variant="outline">{S('avgGrade', { v: nf(seg.grade, 1) })}</Badge>}
          <Badge variant="outline">{S('attemptsN', { n })}</Badge>
          {seg.strava && (
            <Badge variant="outline" asChild>
              <a href={seg.strava} target="_blank" rel="noopener">{S('onStrava')}<ExternalLink aria-hidden="true" /></a>
            </Badge>
          )}
        </div>
      </header>

      <h2 className="sr-only">{S('keyFigures')}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="segment-kpis">
        {kpis(seg).map(({ key, ...k }) => <KpiCard key={key} {...k} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid lg:col-span-8" data-testid="attempts-chart">
          <ChartCard title={S('allAttempts')} description={S('allAttemptsSub')}>
            <AttemptsChart efforts={seg.efforts} />
          </ChartCard>
        </div>
        <div className="grid lg:col-span-4">
          <ChartCard title={S('prHistory')} description={S('prHistorySub')}>
            <PrHistory efforts={seg.efforts} />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="grid" data-testid="segment-map">
          <ChartCard title={S('route')} description={track === null ? S('noStreams') : S('routeSub')}>
            {track === undefined ? loading : track === null ? (
              <EmptyState icon={MapIcon} className="h-[260px]">{S('routeEmpty')}</EmptyState>
            ) : (
              <div className="relative h-[260px] overflow-hidden rounded-md"><SegmentMap latlng={track.latlng} /></div>
            )}
          </ChartCard>
        </div>
        <div className="grid" data-testid="elevation-chart">
          <ChartCard title={S('elev')} description={track ? S('elevSub') : undefined}>
            {track === undefined ? loading : track === null ? <EmptyState className="h-[260px]">{t('common.noData')}</EmptyState> : <ElevationChart profile={track.profile} />}
          </ChartCard>
        </div>
        <div className="grid" data-testid="watts-chart">
          <ChartCard title={S('wvt')} description={S('wvtSub')}>
            <WattsChart efforts={seg.efforts} />
          </ChartCard>
        </div>
      </div>

      <div data-testid="attempts-table">
        <ChartCard title={S('allAttempts')} description={S('attemptsSub', { n: S('attemptsN', { n }) })}>
          <DataTable
            label={S('allAttempts')}
            columns={columns}
            data={seg.efforts}
            getRowId={getRowId}
            rowHref={rowHref}
            initialSorting={SORT}
            empty={t('common.noData')}
          />
        </ChartCard>
      </div>
    </div>
  );
}
