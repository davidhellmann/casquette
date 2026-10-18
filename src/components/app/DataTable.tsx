import * as React from 'react';
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, LayoutList, Search, Table2 } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Clickable rows: pointer, and a thin pink edge on the first cell while hovered or keyboard-focused (an inset line, not a shadow).
const ROW_LINK = 'cursor-pointer [&>td:first-child]:transition-shadow [&:hover>td:first-child]:shadow-[inset_3px_0_0_var(--brand)] [&:focus-within>td:first-child]:shadow-[inset_3px_0_0_var(--brand)]';
import { fmtMonthYear } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { SegmentedToggle } from './SegmentedToggle';
import { groupRows, type GroupBy, type RowGroup } from './table-groups';
import { useStored } from './use-stored';

export interface DataTableColumnMeta {
  /** Column name in the header and the column menu. */
  label: string;
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** Extra classes for the column's cells (header and body). */
  className?: string;
  /** Inline style of a body cell, e.g. a tint that encodes the value – colours only as `var(--token)`. */
  cellStyle?: (row: any) => React.CSSProperties | undefined;
}

/** Features of every DataTable: sorting, global search, column visibility, pagination. */
export const dataTableFeatures = tableFeatures({
  columnMeta: metaHelper<DataTableColumnMeta>(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text, datetime: sortFn_datetime },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
type Features = typeof dataTableFeatures;
export type DataTableColumn<T> = ColumnDef<Features, T, any>;

/** Column helper typed for DataTable – `const col = dataTableColumns<Ride>()`. */
export const dataTableColumns = <T,>() => createColumnHelper<Features, T>();

/** Column meta of a numeric column: right-aligned, tabular figures (`className` e.g. for responsive hiding). */
export const numeric = (label: string, className?: string): DataTableColumnMeta => ({ label, numeric: true, ...(className ? { className } : {}) });
/** Sorting of a numeric column: largest first, missing values last. */
export const numSort = { sortFn: 'basic', sortDescFirst: true, sortUndefined: 'last' } as const;

/** Week/month grouping of a ride list – an option of the tiles view (tiles always come in date order by `column`). */
export interface DataTableGrouping<T> {
  /** Id of the date column; sorting by another column shows the flat list. */
  column: string;
  dateOf: (row: T) => Date;
  /** Right side of a group header, from all rows of the group (across pages). */
  totals: (rows: T[]) => React.ReactNode;
  /** Accessible name of the grouping control. */
  label: string;
  initial?: GroupBy;
}

/** Tile view of a list (Table / Tiles toggle; below 640 px the tiles are always used). Needs `rowHref`. */
export interface DataTableTiles<T> {
  /** Content of one tile – the tile itself is the link. */
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  /** Accessible name of the table. */
  label: string;
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Rows are links: a click opens this URL (Cmd/Ctrl-click in a new tab). Keep a real link in one cell for the keyboard. */
  rowHref?: (row: T) => string;
  initialSorting?: SortingState;
  /** Text a row is found by; shows the search field. */
  searchText?: (row: T) => string;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Rows per page; `false` shows all rows without page controls. */
  pageSize?: number | false;
  /** Shows the column menu for hiding columns. */
  columnToggle?: boolean;
  /** Week/month grouping (ride lists). */
  grouping?: DataTableGrouping<T>;
  /** Table/Tiles view (ride lists). */
  tiles?: DataTableTiles<T>;
  /** Remembers the grouping of this table in localStorage under this id. */
  storageId?: string;
  /** Shown in place of the rows when there are none (after searching). */
  empty: React.ReactNode;
  /** Footer line for the rows left after searching (all pages). */
  summary?: (rows: T[]) => React.ReactNode;
  className?: string;
}

type View = 'table' | 'tiles';
const VIEWS = ['table', 'tiles'] as const;
const GROUPS = ['none', 'week', 'month'] as const;
/** One Table/Tiles choice for every ride list. */
export const VIEW_STORAGE_KEY = 'rc_table_view';

const meta = (column: Column<Features, any, any>) => column.columnDef.meta as DataTableColumnMeta | undefined;
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;
// Header labels: small uppercase mono, muted (DESIGN.md "Tables")
const LABEL = 'font-mono text-[10.5px] font-normal tracking-[0.08em] uppercase';

function SortHeader({ column }: { column: Column<Features, any, any> }) {
  const m = meta(column);
  if (!column.getCanSort()) return <>{m?.label}</>;
  const dir = column.getIsSorted();
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className={cn('-mx-2 h-7 gap-1 px-2 text-muted-foreground hover:text-foreground', LABEL, m?.numeric && 'flex-row-reverse')} onClick={column.getToggleSortingHandler()}>
      {m?.label}
      <Icon className={cn('size-3', !dir && 'opacity-40')} aria-hidden="true" />
    </Button>
  );
}

function openRow(href: string, e: React.MouseEvent) {
  if ((e.target as Element).closest('a, button, input')) return; // the cell's own control handles it
  if (e.metaKey || e.ctrlKey || e.button === 1) window.open(href, '_blank');
  else location.href = href;
}

/** Name of a week or month group; the year only when it isn't the current one. */
function GroupName<T>({ g }: { g: RowGroup<T> }) {
  if (g.by === 'month') return <span className="font-medium text-foreground">{fmtMonthYear(new Date(g.year, g.index, 1))}</span>;
  return (
    <span className="font-medium text-foreground">
      {t('table.week', { n: g.index })}
      {g.year !== new Date().getFullYear() && <span className="font-normal text-muted-foreground"> · {g.year}</span>}
    </span>
  );
}

/**
 * A data table (TanStack Table on the shadcn Table primitives): sortable headers, optional search,
 * column menu and pagination, numeric columns right-aligned with tabular figures, row links.
 * Ride lists add a Table/Tiles view: the table is flat and sortable, the tiles come by date and can be grouped by week or month.
 */
export function DataTable<T>({
  label, columns, data, getRowId, rowHref, initialSorting = [], searchText, searchLabel = t('table.search'), searchPlaceholder,
  pageSize = 25, columnToggle = false, grouping, tiles, storageId, empty, summary, className,
}: DataTableProps<T>) {
  const firstColumn = columns[0]?.id ?? (columns[0] as { accessorKey?: string })?.accessorKey;
  const search = React.useMemo(() => {
    if (!searchText) return undefined;
    return (row: Row<Features, T>, _id: string, q: string) => searchText(row.original).toLowerCase().includes(String(q).trim().toLowerCase());
  }, [searchText]);
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    initialState: { sorting: initialSorting, pagination: { pageIndex: 0, pageSize: pageSize || Number.MAX_SAFE_INTEGER } },
    enableSortingRemoval: false,
    globalFilterFn: search,
    // The search matches whole rows: evaluate it once per row, on the first column
    getColumnCanGlobalFilter: (column) => column.id === firstColumn,
  });
  const [groupBy, setGroupBy] = useStored<GroupBy>(grouping && storageId ? `rc_table_group:${storageId}` : undefined, grouping?.initial ?? 'none', GROUPS);
  const [view, setView] = useStored<View>(tiles ? VIEW_STORAGE_KEY : undefined, 'table', VIEWS);

  const visible = table.getVisibleLeafColumns().length;
  const filtered = table.getPrePaginatedRowModel().rows;
  const rows = table.getRowModel().rows;
  const pages = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;

  // Tiles always come in date order (newest first); switching to them resets a table sort.
  const byDate = !!grouping && table.state.sorting[0]?.id === grouping.column;
  const chooseView = (v: View) => {
    if (v === 'tiles' && grouping && !byDate) table.setSorting([{ id: grouping.column, desc: true }]);
    setView(v);
  };
  // Grouping (tiles only): groups of this page, totals over all filtered rows.
  const by = grouping && byDate && groupBy !== 'none' ? groupBy : null;
  const groups = by ? groupRows(rows, (r) => grouping!.dateOf(r.original), by) : null;
  const totals = React.useMemo(() => {
    if (!by) return null;
    return new Map(groupRows(filtered.map((r) => r.original), grouping!.dateOf, by).map((g) => [g.key, grouping!.totals(g.rows)]));
  }, [by, filtered, grouping]);

  const hasToolbar = searchText || columnToggle || grouping || tiles;
  const tilesOnly = view === 'tiles';
  const tableView = (
    <Table aria-label={label}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="border-border/70 hover:bg-transparent">
            {group.headers.map((header) => {
              const m = meta(header.column);
              const dir = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  aria-sort={dir ? ARIA_SORT[dir] : undefined}
                  className={cn('h-9 text-muted-foreground first:pl-4 last:pr-4', LABEL, m?.numeric && 'text-right', m?.className)}
                >
                  {header.isPlaceholder ? null : <SortHeader column={header.column} />}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      {!rows.length ? (
        <TableBody>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={visible} className="h-24 text-center text-muted-foreground">{empty}</TableCell>
          </TableRow>
        </TableBody>
      ) : (
        <TableBody>
          {rows.map((row) => {
            const href = rowHref?.(row.original);
            return (
              <TableRow
                key={row.id}
                className={cn('border-border/70 transition-colors hover:bg-background', href && ROW_LINK)}
                onClick={href ? (e) => openRow(href, e) : undefined}
                onAuxClick={href ? (e) => openRow(href, e) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const m = meta(cell.column);
                  return (
                    <TableCell key={cell.id} className={cn('py-2.5 first:pl-4 last:pr-4', m?.numeric && 'text-right tabular-nums', m?.className)} style={m?.cellStyle?.(row.original)}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      )}
    </Table>
  );

  const tile = (row: Row<Features, T>) => (
    <li key={row.id}>
      <a
        href={rowHref?.(row.original)}
        className="block rounded-md bg-background/55 px-4 py-2.5 transition-[background-color,box-shadow] outline-none hover:bg-background hover:shadow-[inset_3px_0_0_var(--brand)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tiles!.render(row.original)}
      </a>
    </li>
  );
  const tilesView = tiles && (
    <div data-testid="table-tiles" className="grid gap-4">
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : groups ? groups.map((g) => (
        <div key={g.key} className="grid gap-1.5">
          <p id={`tiles-${storageId ?? 'list'}-${g.key}`} data-testid="tile-group" className="flex items-baseline justify-between gap-4 px-1 text-xs">
            <GroupName g={g} />
            <span className="font-mono text-muted-foreground tabular-nums">{totals?.get(g.key)}</span>
          </p>
          <ul className="grid gap-1.5" aria-labelledby={`tiles-${storageId ?? 'list'}-${g.key}`}>{g.rows.map(tile)}</ul>
        </div>
      )) : (
        <ul className="grid gap-1.5" aria-label={label}>{rows.map(tile)}</ul>
      )}
    </div>
  );

  return (
    <div className={cn('grid gap-3', className)} data-slot="data-table">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchText && (
            <label className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label={searchLabel}
                placeholder={searchPlaceholder ?? searchLabel}
                className="h-8 pl-8"
                value={table.state.globalFilter ?? ''}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
              />
            </label>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {grouping && tiles && (
              // Only with tiles: always on a phone (tiles forced), on wider screens in the tiles view
              <div className={cn('flex items-center gap-2', !tilesOnly && 'sm:hidden')}>
                <span className="text-xs text-muted-foreground">{t('table.groupBy')}</span>
                <SegmentedToggle
                  label={grouping.label}
                  value={groupBy}
                  onChange={setGroupBy}
                  options={GROUPS.map((value) => ({ value, label: t(`table.group.${value}`) }))}
                />
              </div>
            )}
            {tiles && (
              <SegmentedToggle
                label={t('table.view')}
                value={view}
                onChange={chooseView}
                className="hidden sm:flex"
                options={[
                  { value: 'table', label: <><Table2 aria-hidden="true" />{t('table.viewTable')}</> },
                  { value: 'tiles', label: <><LayoutList aria-hidden="true" />{t('table.viewTiles')}</> },
                ]}
              />
            )}
            {columnToggle && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8', tiles && 'hidden sm:inline-flex', tiles && view === 'tiles' && 'sm:hidden')}>
                    <Columns3 aria-hidden="true" />
                    {t('table.columns')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                      {meta(c)?.label ?? c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {!tiles ? tableView : view === 'tiles' ? tilesView : (
        <>
          {/* Below 640 px ride lists always use tiles */}
          <div className="sm:hidden">{tilesView}</div>
          <div className="hidden sm:block">{tableView}</div>
        </>
      )}

      {(summary || (pageSize && pages > 1)) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {summary && <p data-testid="table-summary">{summary(filtered.map((r) => r.original))}</p>}
          {pageSize !== false && pages > 1 && (
            <div className="ml-auto flex items-center gap-1">
              <span className="mr-2" data-testid="table-page">{t('table.pageInfo', { page: pageIndex + 1, pages })}</span>
              <Button variant="outline" size="icon" className="size-8" aria-label={t('table.first')} disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()}><ChevronsLeft /></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label={t('table.prev')} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label={t('table.next')} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label={t('table.last')} disabled={!table.getCanNextPage()} onClick={() => table.lastPage()}><ChevronsRight /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
