import * as React from 'react';
import { CardLabel } from '@/components/app/CardLabel';
import { DataTable } from '@/components/app/DataTable';
import { EmptyState } from '@/components/app/EmptyState';
import { useDashboard } from '@/components/dashboard/use-dashboard';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { rideColumns, rideGrouping, rideRows, rideSearchText, rideTiles, type RideRow } from './ride-columns';
import { useIslandReady } from '@/lib/island-ready';

const rides = (n: number) => t('common.rides', { n: nf(n) });
const sum = (rows: RideRow[], f: (r: RideRow) => number) => rows.reduce((s, r) => s + f(r), 0);
const summary = (rows: RideRow[]) => t('log.summary', {
  rides: rides(rows.length), km: nf(sum(rows, (r) => r.km)), h: nf(sum(rows, (r) => r.time) / 3600, 1), elev: nf(sum(rows, (r) => r.elev)),
});
const getRowId = (r: RideRow) => r.id;
const rowHref = (r: RideRow) => r.href;
const SORT = [{ id: 'date', desc: true }];
const GROUPING = rideGrouping('week');

/** Ride log (new UI): every ride of the period chosen in the page header – sortable, searchable, paged. */
export function RidesView() {
  useIslandReady();
  return (
    <>
      <h1 className="sr-only">{t('log.title')}</h1>
      <RideLog />
    </>
  );
}

function RideLog() {
  const data = useDashboard();
  const days = data?.period.days;
  const longDate = days === 0 || (days ?? 0) > 90;
  const columns = React.useMemo(() => rideColumns({ longDate }), [longDate]);
  const tiles = React.useMemo(() => rideTiles(longDate), [longDate]);
  const rows = React.useMemo(() => (data?.D ? rideRows(data.D, data.period.basis, data.source.base) : []), [data]);
  if (!data) return <Skeleton className="h-[640px] rounded-lg" aria-busy="true" />;
  return (
    <Card data-testid="ride-log">
      <CardHeader>
        <CardLabel as="h2">{t('log.title')}</CardLabel>
        <CardDescription className="text-xs">{t('log.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.D ? (
          <DataTable
            label={t('log.title')}
            columns={columns}
            data={rows}
            getRowId={getRowId}
            rowHref={rowHref}
            initialSorting={SORT}
            searchText={rideSearchText}
            searchLabel={t('log.searchLabel')}
            searchPlaceholder={t('log.search')}
            columnToggle
            grouping={GROUPING}
            tiles={tiles}
            storageId="rides"
            empty={t('common.noRidesFound')}
            summary={summary}
          />
        ) : (
          <EmptyState>{t('years.emptyHint')}</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
