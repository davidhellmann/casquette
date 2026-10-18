import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { RideList } from '@/components/rides/RideList';
import type { RideColumnId } from '@/components/rides/ride-columns';
import { rideRows } from '@/components/rides/ride-list.js';
import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes.js';
import { t } from '@/i18n/index.js';

const COLUMNS: RideColumnId[] = ['date', 'name', 'km', 'time', 'elev', 'w', 'zone', 'tss'];

/** The latest rides of the period, with a link to the full ride log. */
export function RecentRides({ D, basis }: { D: any; basis: 'power' | 'hr' }) {
  const rows = React.useMemo(() => rideRows(D.log.slice(0, 10), { basis }), [D, basis]);
  return (
    <ChartCard
      data-testid="recent-rides"
      title={t('dash.card.recent')}
      description={t('dash.card.recentSub')}
      action={<Button variant="ghost" size="sm" asChild><a href={routes.rides()}>{t('dash.card.logOpen')}<ArrowRight aria-hidden="true" /></a></Button>}
    >
      <RideList label={t('dash.card.recent')} rides={rows} columns={COLUMNS} pageSize={false} storageId="recent" empty={t('dash.chart.noRidesPeriod')} />
    </ChartCard>
  );
}
