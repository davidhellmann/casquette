import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { CardLabel } from '@/components/app/CardLabel';
import { ChartCard } from '@/components/app/ChartCard';
import { KpiCard, type KpiCardProps } from '@/components/app/KpiCard';
import { Row as KeyRow } from '@/components/app/KeyFigures';
import type { RideColumnId, RideRow } from '@/components/rides/ride-columns';
import { RideList } from '@/components/rides/RideList';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { fmtDur, fmtIso, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { GearCurveChart, MonthBars, TerrainChart, YearBars } from './GearCharts';
import { PrimaryBadge, StatusBadge } from './GearView';
import { useIslandReady } from '@/lib/island-ready';

export interface GearRecord {
  key: 'longest' | 'climb' | 'fastest' | 'np';
  ride: { href: string; name: string; date: string; value: number } | null;
}

/** Build payload of /gear/<id> (src/pages/gear/[id].astro). */
export interface GearDetailPayload {
  name: string;
  /** Frame type, or "Bicycle"/"Shoe". */
  kind: string;
  brandModel: string;
  retired: boolean;
  primary: boolean;
  weight: number | null;
  color: string | null;
  stravaUrl: string | null;
  description: string | null;
  stats: {
    km: number; rides: number; hours: number; elev: number; avgSpeed: number | null; indoorShare: number | null;
    kj: number; tss: number; first: string | null; last: string | null;
  };
  purchase: string | null;
  price: number | null;
  costPerKm: number | null;
  ownedYears: number | null;
  components: string[];
  notes: string | null;
  months: { key: string; km: number }[];
  years: { year: number; km: number }[];
  terrains: { terrain: string; km: number }[];
  curve: Record<string, number>;
  curveWkg: Record<string, number | null>;
  records: GearRecord[];
  /** rideRows in src/components/rides/ride-list.ts. */
  rides: RideRow[];
  currentYear: number;
}

const g = (key: string, p?: Record<string, unknown>) => t(`gear.${key}`, p);
const recordValue: Record<GearRecord['key'], (v: number) => string> = {
  longest: (v) => `${nf(v / 1000, 1)} km`,
  climb: (v) => `${nf(v)} ${t('units.elev')}`,
  fastest: (v) => `${nf(v * 3.6, 1)} km/h`,
  np: (v) => `${Math.round(v)} W`,
};
const COLUMNS: RideColumnId[] = ['date', 'name', 'km', 'time', 'elev', 'w', 'np', 'hr', 'tss'];

const Row = (p: React.ComponentProps<typeof KeyRow>) => <KeyRow className="text-sm" {...p} />;

function kpis(P: GearDetailPayload): (KpiCardProps & { key: string })[] {
  const s = P.stats;
  const out: (KpiCardProps & { key: string })[] = [
    { key: 'km', label: g('kmStats'), value: s.km, unit: 'km', series: 'distance', secondary: g('earthPct', { n: nf((s.km / 40075) * 100, 1) }) },
    { key: 'rides', label: t('metric.rides'), value: s.rides, series: 'rides', secondary: s.rides ? g('avgKm', { v: nf(s.km / s.rides, 1) }) : '–' },
    { key: 'time', label: g('inSaddle'), value: s.hours, unit: 'h', series: 'time', secondary: s.rides ? g('avgDur', { v: fmtDur((s.hours * 3600) / s.rides) }) : '–' },
    { key: 'elev', label: t('metric.elevation'), value: s.elev, unit: t('units.elev'), series: 'elevation', secondary: t('common.everestShort', { n: nf(s.elev / 8849, 1) }) },
  ];
  if (P.costPerKm != null) out.push({ key: 'cost', label: g('costKm'), value: P.costPerKm, decimals: 2, unit: '€', series: 'prs', secondary: g('costKmSub', { v: nf(P.price) }) });
  return out;
}

/** Bike detail (new UI): figures, setup, kilometres per month/year, terrains, power curve, records, rides. */
export function GearDetailView({ P, children }: { P: GearDetailPayload; children?: React.ReactNode }) {
  useIslandReady();
  const s = P.stats;
  const figures = kpis(P);
  return (
    <div className="grid gap-3 pb-8" data-testid="gear-detail">
      <header className="grid gap-2">
        <p className="font-mono text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{P.kind}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{P.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {P.brandModel && <span className="mr-1">{P.brandModel}</span>}
          <StatusBadge retired={P.retired} />
          {P.primary && <PrimaryBadge>{g('primaryBike')}</PrimaryBadge>}
          {P.stravaUrl && (
            <Badge variant="outline" asChild className="font-normal">
              <a href={P.stravaUrl} target="_blank" rel="noopener">{t('common.strava')}<ExternalLink aria-hidden="true" /></a>
            </Badge>
          )}
        </div>
        {P.description && <p className="max-w-3xl text-sm text-muted-foreground">{P.description}</p>}
      </header>

      <h2 className="sr-only">{g('stats')}</h2>
      <div className={figures.length > 4 ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5' : 'grid grid-cols-2 gap-3 xl:grid-cols-4'} data-testid="gear-kpis">
        {figures.map(({ key, ...x }) => <KpiCard key={key} {...x} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardLabel>{g('stats')}</CardLabel>
            <CardDescription className="text-xs">{g('statsSub', { n: nf(s.rides) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label={g('avgSpeedOut')}>{s.avgSpeed == null ? '–' : `${nf(s.avgSpeed, 1)} km/h`}</Row>
              <Row label={g('indoorShare')}>{s.indoorShare == null ? '–' : `${nf(s.indoorShare)} %`}</Row>
              <Row label={g('work')}>{s.kj ? `${nf(s.kj)} kJ · ${g('pizzas', { n: nf(s.kj / 800) })}` : '–'}</Row>
              <Row label={t('metric.trainingLoad')}>{s.tss ? `${nf(s.tss)} TSS` : '–'}</Row>
              <Row label={g('firstRide')}>{s.first ? fmtIso(s.first) : '–'}</Row>
              <Row label={g('lastRideL')}>{s.last ? fmtIso(s.last) : '–'}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card data-testid="gear-setup">
          <CardHeader><CardLabel>{g('setup')}</CardLabel></CardHeader>
          <CardContent className="grid gap-3">
            <dl>
              <Row label={g('purchaseDate')}>{P.purchase ? fmtIso(P.purchase) : '–'}</Row>
              <Row label={g('price')}>{P.price != null ? `${nf(P.price)} €` : '–'}</Row>
              {P.ownedYears != null && <Row label={g('owned')}>{`${nf(P.ownedYears, 1)} ${g('years')}`}</Row>}
              {P.weight != null && <Row label={g('weight')}>{`${nf(P.weight, 1)} kg`}</Row>}
              {P.color && <Row label={g('colour')}>{P.color}</Row>}
            </dl>
            {P.components.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={g('components')}>
                {P.components.map((c) => <li key={c}><Badge variant="outline" className="font-normal">{c}</Badge></li>)}
              </ul>
            )}
            {P.notes && <p className="text-sm text-muted-foreground">{P.notes}</p>}
            {children && <div className="grid gap-2 text-sm text-muted-foreground">{children}</div>}
          </CardContent>
        </Card>
      </div>

      {P.rides.length > 0 && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <div data-testid="gear-month-chart" className="grid lg:col-span-2">
              <ChartCard title={g('perMonth')} description={g('last24')}><MonthBars months={P.months} /></ChartCard>
            </div>
            <div data-testid="gear-terrain-chart" className="grid">
              <ChartCard title={g('usage')} description={g('usageSub')}><TerrainChart terrains={P.terrains} /></ChartCard>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div data-testid="gear-year-chart" className="grid">
              <ChartCard title={g('perYear')}><YearBars years={P.years} currentYear={P.currentYear} /></ChartCard>
            </div>
            <div data-testid="gear-curve-chart" className="grid">
              <ChartCard title={g('curve')} description={g('curveSub')}><GearCurveChart curve={P.curve} wkg={P.curveWkg} /></ChartCard>
            </div>
          </div>

          <section className="grid gap-3" aria-labelledby="gear-records" data-testid="gear-records">
            <CardLabel as="h2" className="mt-3"><span id="gear-records">{g('records')}</span></CardLabel>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {P.records.map(({ key, ride }) => (
                <Card key={key} className="relative gap-1 px-5 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/70">
                  <h3 className="font-mono text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{g(`record.${key}`)}</h3>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">{ride ? recordValue[key](ride.value) : '–'}</p>
                  {ride && (
                    <p className="truncate text-xs text-muted-foreground">
                      <a href={ride.href} className="outline-none after:absolute after:inset-0 after:content-['']">{ride.name}</a>
                      {` · ${fmtIso(ride.date)}`}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <Card data-testid="gear-rides">
            <CardHeader>
              <CardLabel as="h2">{g('allRides')}</CardLabel>
              <CardDescription className="text-xs">{g('allRidesSub', { rides: t('common.rides', { n: nf(P.rides.length) }) })}</CardDescription>
            </CardHeader>
            <CardContent>
              <RideList
                label={g('allRides')}
                rides={P.rides}
                columns={COLUMNS}
                longDate
                search
                pageSize={10}
                storageId="bike-rides"
                empty={t('common.noRidesFound')}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
