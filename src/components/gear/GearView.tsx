import { Star } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { CardLabel } from '@/components/app/CardLabel';
import { EmptyState } from '@/components/app/EmptyState';
import { KpiCard } from '@/components/app/KpiCard';
import { Figure } from '@/components/app/KeyFigures';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { fmtIso, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { BikesPerYearChart, YearBars } from './GearCharts';
import { useIslandReady } from '@/lib/island-ready';

export interface BikeSummary {
  id: string;
  name: string;
  href: string;
  /** Frame type · brand · model. */
  sub: string;
  primary: boolean;
  retired: boolean;
  km: number;
  rides: number;
  hours: number;
  elev: number;
  years: { year: number; km: number }[];
  /** 'YYYY-MM-DD' of the last ride, null without rides. */
  lastRide: string | null;
  costPerKm: number | null;
}

/** Build payload of /gear (src/pages/gear/index.astro). */
export interface GearPayload {
  /** Active bikes first, then by kilometres. */
  bikes: BikeSummary[];
  shoes: { id: string; name: string; sub: string; retired: boolean; km: number }[];
  /** Kilometres per bike and year (stacked chart), bikes with rides only. */
  perYear: { bikes: { id: string; name: string; color: string }[]; rows: ({ year: number } & Record<string, number>)[] };
  currentYear: number;
}

export function StatusBadge({ retired }: { retired: boolean }) {
  return <Badge variant={retired ? 'outline' : 'secondary'} className="font-normal text-muted-foreground">{t(retired ? 'common.retired' : 'common.active')}</Badge>;
}

export function PrimaryBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="bg-brand-surface font-normal text-brand-surface-foreground">
      <Star aria-hidden="true" />{children}
    </Badge>
  );
}

/** One bike: name (links to the bike), status, kilometres, figures and kilometres per year. */
function BikeCard({ b, currentYear }: { b: BikeSummary; currentYear: number }) {
  return (
    <Card className="relative gap-3 px-5 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/70" data-testid="bike-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium">
            {/* Stretched link: the whole card opens the bike */}
            <a href={b.href} className="outline-none after:absolute after:inset-0 after:content-['']">{b.name}</a>
          </h3>
          <p className="truncate text-xs text-muted-foreground">{b.sub}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {b.primary && <PrimaryBadge>{t('gear.primary')}</PrimaryBadge>}
          <StatusBadge retired={b.retired} />
        </div>
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">
        {nf(b.km)}<span className="ml-1 font-mono text-xs font-normal text-muted-foreground">km</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Figure compact value={nf(b.rides)} label={t('metric.rides')} />
        <Figure compact value={`${nf(b.hours)} h`} label={t('years.inSaddle')} />
        <Figure compact value={`${nf(b.elev)} ${t('units.elev')}`} label={t('years.elev')} />
      </div>
      {b.years.length > 0 && (
        <YearBars years={b.years} currentYear={currentYear} height={76} decorative />
      )}
      <p className="text-xs text-muted-foreground">
        {b.lastRide ? t('gear.lastRide', { d: fmtIso(b.lastRide) }) : t('gear.noSynced')}
        {b.costPerKm != null && ` · ${nf(b.costPerKm, 2)} €/km`}
      </p>
    </Card>
  );
}

/** Gear overview (new UI): key figures, one card per bike, kilometres per bike and year, shoes. */
export function GearView({ P }: { P: GearPayload }) {
  useIslandReady();
  const { bikes, shoes } = P;
  const active = bikes.filter((b) => !b.retired);
  const totalKm = bikes.reduce((s, b) => s + b.km, 0);
  const fav = bikes.slice().sort((a, b) => b.km - a.km)[0];
  const shoesKm = shoes.reduce((s, x) => s + x.km, 0);
  return (
    <div className="grid gap-3 pb-8" data-testid="gear">
      <h1 className="sr-only">{t('gear.title')}</h1>
      {!bikes.length && !shoes.length ? (
        <Card className="px-5">
          <EmptyState>
            {t('gear.empty')}
            <span className="mt-1 block text-xs" dangerouslySetInnerHTML={{ __html: t('gear.emptyHint') }} />
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="max-w-3xl text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('gear.intro', { bikes: bikes.length, active: active.length, km: nf(totalKm) }) }} />
          <h2 className="sr-only">{t('gear.stats')}</h2>
          <div className={shoes.length ? 'grid grid-cols-2 gap-3 xl:grid-cols-4' : 'grid grid-cols-2 gap-3 xl:grid-cols-3'}>
            <KpiCard label={t('gear.bikes')} value={bikes.length} series="rides" secondary={t('gear.bikesSub', { active: active.length, retired: bikes.length - active.length })} />
            <KpiCard label={t('gear.kmTotal')} value={totalKm} unit="km" series="distance" secondary={t('common.earth', { n: nf(totalKm / 40075, 1) })} />
            <KpiCard label={t('gear.mostRidden')} value={fav ? fav.km : null} unit="km" series="distance" secondary={fav ? fav.name : '–'} />
            {shoes.length > 0 && <KpiCard label={t('gear.shoes')} value={shoes.length} series="rides" secondary={t('gear.shoesSub', { km: nf(shoesKm) })} />}
          </div>

          {bikes.length > 0 && (
            <section className="grid gap-3" aria-labelledby="gear-bikes">
              <CardLabel as="h2" className="mt-3"><span id="gear-bikes">{t('gear.bikes')}</span></CardLabel>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {bikes.map((b) => <BikeCard key={b.id} b={b} currentYear={P.currentYear} />)}
              </div>
            </section>
          )}

          {P.perYear.bikes.length > 1 && (
            <div data-testid="gear-bikes-chart" className="grid">
              <ChartCard title={t('gear.perBikeYear')} description={t('gear.perBikeYearSub')}>
                <BikesPerYearChart bikes={P.perYear.bikes} rows={P.perYear.rows} />
              </ChartCard>
            </div>
          )}

          {shoes.length > 0 && (
            <section className="grid gap-3" aria-labelledby="gear-shoes">
              <CardLabel as="h2" className="mt-3"><span id="gear-shoes">{t('gear.shoes')}</span></CardLabel>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {shoes.map((s) => (
                  <Card key={s.id} className="gap-2 px-5" data-testid="shoe-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-medium">{s.name}</h3>
                        {s.sub && <p className="truncate text-xs text-muted-foreground">{s.sub}</p>}
                      </div>
                      <StatusBadge retired={s.retired} />
                    </div>
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">
                      {nf(s.km)}<span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{t('gear.kmStrava')}</span>
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
