import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { DataTable } from '@/components/app/DataTable';
import { rideColumns, rideGrouping, rideRows, rideTiles, type RideRow } from '@/components/rides/ride-columns';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/index.js';

const COLUMNS = rideColumns({ longDate: false, only: ['date', 'name', 'km', 'time', 'elev', 'w', 'zone', 'tss'] });
const SORT = [{ id: 'date', desc: true }];
const GROUPING = rideGrouping();
const TILES = rideTiles();
const getRowId = (r: RideRow) => r.id;
const rowHref = (r: RideRow) => r.href;

/** The latest rides of the period, with a link to the full ride log. */
export function RecentRides({ D, basis, base }: { D: any; basis: 'power' | 'hr'; base: string }) {
  const rows = React.useMemo(() => rideRows({ ...D, log: D.log.slice(0, 10) }, basis, base), [D, basis, base]);
  return (
    <ChartCard
      data-testid="recent-rides"
      title={t('dash.card.recent')}
      description={t('dash.card.recentSub')}
      action={<Button variant="ghost" size="sm" asChild><a href={`${base}rides`}>{t('dash.card.logOpen')}<ArrowRight aria-hidden="true" /></a></Button>}
    >
      <DataTable label={t('dash.card.recent')} columns={COLUMNS} data={rows} getRowId={getRowId} rowHref={rowHref} initialSorting={SORT} pageSize={false} grouping={GROUPING} tiles={TILES} storageId="recent" empty={t('dash.chart.noRidesPeriod')} />
    </ChartCard>
  );
}
