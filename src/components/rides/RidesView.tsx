import * as React from 'react';
import { BasisSwitch } from '@/components/app/BasisSwitch';
import { CardLabel } from '@/components/app/CardLabel';
import { EmptyState } from '@/components/app/EmptyState';
import { useDashboard } from '@/components/dashboard/use-dashboard';
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n/index.ts';
import { RideList } from './RideList';
import { rideRows } from './ride-list.ts';
import { useIslandReady } from '@/lib/island-ready';

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
  const rows = React.useMemo(() => (data?.D ? rideRows(data.D.log, { basis: data.period.basis }) : []), [data]);
  if (!data) return <Skeleton className="h-[640px] rounded-lg" aria-busy="true" />;
  return (
    <Card data-testid="ride-log">
      <CardHeader>
        <CardLabel as="h2">{t('log.title')}</CardLabel>
        <CardDescription className="text-xs">{t('log.intro')}</CardDescription>
        <CardAction><BasisSwitch /></CardAction>
      </CardHeader>
      <CardContent>
        {data.D ? (
          <RideList
            label={t('log.title')}
            rides={rows}
            longDate={longDate}
            search
            columnToggle
            group="week"
            storageId="rides"
            empty={t('common.noRidesFound')}
            summary
          />
        ) : (
          <EmptyState>{t('years.emptyHint')}</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
