import { Badge } from '@/components/ui/badge';
import { DataTable, dataTableColumns, numeric, numSort, type DataTableColumn } from '@/components/app/DataTable';
import { EmptyState } from '@/components/app/EmptyState';
import { routes } from '@/lib/routes.js';
import { fmtIso, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

export interface HistoryEntry { date: string; ftp: number | null; weight: number | null; source: string | null; note: string | null }
type Best = { w: number; wkg: number; kg: number; id: string };
export interface ProfileYear { year: number; vals: (Best | null)[] }

const v = (x: number | null | undefined) => (x == null ? undefined : x);

const hist = dataTableColumns<HistoryEntry & { i: number }>();
function historyColumns(): DataTableColumn<HistoryEntry & { i: number }>[] {
  const L: string[] = t('perf.histCols');
  return hist.columns([
    hist.accessor('date', { id: 'date', meta: { label: L[0] }, sortFn: 'text', sortDescFirst: true, cell: (c) => fmtIso(c.getValue()) }),
    hist.accessor((h) => v(h.ftp), { id: 'ftp', meta: numeric(L[1]), ...numSort, cell: (c) => (c.getValue() == null ? '–' : `${c.getValue()} W`) }),
    hist.accessor((h) => v(h.weight), { id: 'weight', meta: numeric(L[2], 'hidden sm:table-cell'), ...numSort, cell: (c) => (c.getValue() == null ? '–' : `${nf(c.getValue(), 1)} kg`) }),
    hist.accessor((h) => (h.ftp && h.weight ? h.ftp / h.weight : undefined), { id: 'wkg', meta: numeric(L[3]), ...numSort, cell: (c) => (c.getValue() == null ? '–' : nf(c.getValue(), 2)) }),
    hist.accessor((h) => h.source || t('perf.manual'), {
      id: 'source', meta: { label: L[4], className: 'min-w-24 whitespace-normal' }, enableSorting: false,
      cell: (c) => (
        <>
          <Badge variant="outline">{c.getValue()}</Badge>
          {c.row.original.note && <div className="mt-0.5 text-xs text-muted-foreground">{c.row.original.note}</div>}
        </>
      ),
    }),
  ]) as DataTableColumn<HistoryEntry & { i: number }>[];
}

/** FTP / weight entries of the athlete history, newest first. */
export function FtpHistoryTable({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return <EmptyState>{t('perf.chart.noData')}</EmptyState>;
  const rows = history.map((h, i) => ({ ...h, i }));
  return (
    <div data-testid="ftp-history">
      <DataTable
        label={t('perf.history')}
        columns={historyColumns()}
        data={rows}
        getRowId={(h) => String(h.i)}
        initialSorting={[{ id: 'date', desc: true }]}
        pageSize={false}
        empty={t('perf.chart.noData')}
      />
    </div>
  );
}

const prof = dataTableColumns<ProfileYear>();
function profileColumns(durations: string[], colMax: number[]): DataTableColumn<ProfileYear>[] {
  return prof.columns([
    prof.accessor('year', {
      id: 'year', meta: { label: t('perf.year') }, sortFn: 'basic', sortDescFirst: true,
      cell: (c) => <a href={routes.year(c.getValue())} className="font-medium underline-offset-4 hover:underline">{c.getValue()}</a>,
    }),
    ...durations.map((label, i) => prof.accessor((y) => v(y.vals[i]?.wkg), {
      id: `d${i}`, ...numSort,
      meta: {
        label, numeric: true,
        // The tint grows towards the best year of the column
        cellStyle: (y: ProfileYear) => {
          const b = y.vals[i];
          return b ? { background: `color-mix(in oklab, var(--brand) ${Math.round((b.wkg / (colMax[i] || 1)) ** 3 * 22)}%, transparent)` } : undefined;
        },
      },
      cell: (c) => {
        const b = c.row.original.vals[i];
        return b ? (
          <a href={routes.ride(b.id)} title={t('perf.weightTip', { kg: b.kg })} className="underline-offset-4 hover:underline">
            <span className="font-semibold">{`${b.w} W`}</span>
            <span className="ml-1.5 text-xs">{nf(b.wkg, 2)}</span>
          </a>
        ) : '–';
      },
    })),
  ]) as DataTableColumn<ProfileYear>[];
}

/** Best W/kg per year and duration; the cell tint grows towards the best year of each column. */
export function PowerProfileTable({ profile, durations }: { profile: ProfileYear[]; durations: string[] }) {
  if (!profile.length) return <EmptyState>{t('perf.noStreams')}</EmptyState>;
  const colMax = durations.map((_, i) => Math.max(0, ...profile.map((y) => y.vals[i]?.wkg ?? 0)));
  return (
    <div data-testid="power-profile">
      <DataTable
        label={t('perf.profile')}
        columns={profileColumns(durations, colMax)}
        data={profile}
        getRowId={(y) => String(y.year)}
        initialSorting={[{ id: 'year', desc: true }]}
        pageSize={false}
        empty={t('perf.noStreams')}
      />
    </div>
  );
}
