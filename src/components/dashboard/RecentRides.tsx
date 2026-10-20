import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { BasisSwitch } from '@/components/app/BasisSwitch';
import { RideList } from '@/components/rides/RideList';
import type { RideColumnId } from '@/components/rides/ride-columns';
import { rideRows } from '@/components/rides/ride-list.ts';
import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes.ts';
import { t } from '@/i18n/index.ts';
import type { DecodedPeriod } from '@/lib/dashboard-payload.ts';

const COLUMNS: RideColumnId[] = ['date', 'name', 'km', 'time', 'elev', 'w', 'zone', 'tss'];

/** The latest rides of the period, with a link to the full ride log. */
export function RecentRides({ D, basis }: { D: DecodedPeriod; basis: 'power' | 'hr' }) {
  const rows = React.useMemo(() => rideRows(D.log.slice(0, 10), { basis }), [D, basis]);
  return (
    <ChartCard
      data-testid="recent-rides"
      title={t('dash.card.recent')}
      description={t('dash.card.recentSub')}
      action={(
        <div className="flex items-center gap-2">
          <BasisSwitch />
          <Button variant="ghost" size="sm" asChild><a href={routes.rides()}>{t('dash.card.logOpen')}<ArrowRight aria-hidden="true" /></a></Button>
        </div>
      )}
    >
      <RideList label={t('dash.card.recent')} rides={rows} columns={COLUMNS} pageSize={false} storageId="recent" empty={t('dash.chart.noRidesPeriod')} />
    </ChartCard>
  );
}
