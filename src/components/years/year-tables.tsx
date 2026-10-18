import { dataTableColumns, numeric, numSort, type DataTableColumn } from '@/components/app/DataTable';
import { Badge } from '@/components/ui/badge';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import type { YearMonth } from './YearView';

const col = dataTableColumns<YearMonth>();
const L: string[] = t('year.monthCols');
const dash = (v: number | null | undefined, f: (v: number) => string = (x) => nf(x)) => (v ? f(v) : '–');

/** Columns of the months table: totals, average watts, load, Z2 share and the longest ride of each month. */
export function monthColumns(maxKm: number): DataTableColumn<YearMonth>[] {
  return col.columns([
    col.accessor('m', {
      id: 'month', meta: { label: L[0] }, sortFn: 'basic', sortDescFirst: false, enableHiding: false,
      cell: (c) => (
        <span className="flex items-center gap-2 font-medium">
          {c.row.original.long}
          {c.row.original.best && <Badge variant="secondary" className="font-normal">{t('year.bestMonthTag')}</Badge>}
        </span>
      ),
    }),
    col.accessor('n', { id: 'rides', meta: numeric(L[1]), ...numSort, cell: (c) => dash(c.getValue()) }),
    col.accessor('km', {
      id: 'km', meta: numeric(L[2]), ...numSort,
      cell: (c) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
            <span className="ml-auto block h-full rounded-full bg-brand" style={{ width: `${(c.getValue() / maxKm) * 100}%` }} />
          </span>
          {dash(c.getValue())}
        </span>
      ),
    }),
    col.accessor('h', { id: 'h', meta: numeric(L[3]), ...numSort, cell: (c) => dash(c.getValue(), (v) => nf(v, 1)) }),
    col.accessor('elev', { id: 'elev', meta: numeric(L[4]), ...numSort, cell: (c) => dash(c.getValue()) }),
    col.accessor((m) => m.avgW ?? undefined, { id: 'w', meta: numeric(L[5]), ...numSort, cell: (c) => dash(c.getValue(), (v) => String(Math.round(v))) }),
    col.accessor('tss', { id: 'tss', meta: numeric(L[6]), ...numSort, cell: (c) => dash(c.getValue()) }),
    col.accessor((m) => (m.zones ? m.zones[1] : undefined), { id: 'z2', meta: numeric(L[7]), ...numSort, cell: (c) => dash(c.getValue(), (v) => `${nf(v)} %`) }),
    col.accessor((m) => m.longest?.km, {
      id: 'longest', meta: { label: L[8] }, ...numSort,
      cell: (c) => {
        const l = c.row.original.longest;
        return l
          ? <a href={l.href} className="block max-w-72 truncate hover:underline focus-visible:underline" title={l.name}><span className="font-mono tabular-nums">{nf(l.km, 1)} km</span> · {l.name}</a>
          : '–';
      },
    }),
  ]) as DataTableColumn<YearMonth>[];
}
