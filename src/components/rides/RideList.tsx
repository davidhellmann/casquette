import * as React from 'react';
import { DataTable } from '@/components/app/DataTable';
import type { GroupBy } from '@/components/app/table-groups';
import { routes } from '@/lib/routes.ts';
import { t } from '@/i18n/index.ts';
import { rideColumns, rideGrouping, rideTiles, type RideColumnId, type RideRow } from './ride-columns';
import { rideListSummary, rideSearchText } from './ride-list.ts';

export interface RideListProps {
  /** Accessible name of the table. */
  label: string;
  /** Rows from rideRows() (ride-list.ts). */
  rides: RideRow[];
  /** Columns to show, in their fixed order; all by default. */
  columns?: RideColumnId[];
  /** Year in the date column and on the tiles (long periods, a bike's whole life). */
  longDate?: boolean;
  /** Initial sort, descending. */
  sort?: 'date' | 'km';
  /** Search field (name and places). */
  search?: boolean;
  pageSize?: number | false;
  /** Initial week/month grouping of the tiles; null = no grouping (lists not in date order). */
  group?: GroupBy | null;
  /** Shared view choice (Table / Tiles) key, see DataTable. */
  storageId?: string;
  columnToggle?: boolean;
  /** Totals line (rides · km · h · m) under the list. */
  summary?: boolean;
  empty: React.ReactNode;
}

const getRowId = (r: RideRow) => r.id;
const rowHref = (r: RideRow) => routes.ride(r.id);
const SORTS = { date: [{ id: 'date', desc: true }], km: [{ id: 'km', desc: true }] };

/**
 * A list of rides (ride log, recent rides, a year's or a bike's rides): one DataTable setup with the
 * ride columns, tiles, grouping, search and summary (DESIGN.md "Tables").
 */
export function RideList({
  label, rides, columns, longDate = false, sort = 'date', search = false, pageSize, group = 'none',
  storageId, columnToggle = false, summary = false, empty,
}: RideListProps) {
  const key = columns?.join(',');
  const cols = React.useMemo(() => rideColumns({ longDate, only: columns }), [longDate, key]);
  const tiles = React.useMemo(() => rideTiles(longDate), [longDate]);
  const grouping = React.useMemo(() => (group ? rideGrouping(group) : undefined), [group]);
  return (
    <DataTable
      label={label}
      columns={cols}
      data={rides}
      getRowId={getRowId}
      rowHref={rowHref}
      initialSorting={SORTS[sort]}
      {...(search ? { searchText: rideSearchText, searchLabel: t('log.searchLabel'), searchPlaceholder: t('log.search') } : {})}
      {...(pageSize !== undefined ? { pageSize } : {})}
      columnToggle={columnToggle}
      grouping={grouping}
      tiles={tiles}
      storageId={storageId}
      empty={empty}
      summary={summary ? rideListSummary : undefined}
    />
  );
}
