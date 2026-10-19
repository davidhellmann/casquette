import * as React from 'react';
import { Bike, ChevronLeft, ChevronRight, Cpu, ExternalLink, House, MapPin, Star, Trophy } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CardLabel } from '@/components/app/CardLabel';
import { ChartCard } from '@/components/app/ChartCard';
import { EmptyState } from '@/components/app/EmptyState';
import { ZoneBadge } from '@/components/rides/ride-columns';
import { fmtClock, fmtDur, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import type { ZoneSet } from '@/training/index.ts';
import { RideMap, type LatLng, type RideMapHandle } from './RideMap';
import { isLatLng } from './ride-data.ts';
import { StreamCharts, type StreamZones } from './StreamCharts';
import { TimeInZones } from '@/components/charts/ZoneBars';
import { RideCurveChart, type RideCurveProps } from './RideCurveChart';
import { LapsTable, SegmentsTable, SplitsTable, type Lap, type SegmentEffort, type Split } from './RideTables';
import { useIslandReady } from '@/lib/island-ready';
import { useChartStreams } from '@/components/app/use-chart-streams';
import { rideDecoupling, toneBg, zoneBg } from './ride-presentation.ts';
import { DecouplingScale } from './DecouplingScale';

type Zones = ZoneSet;
interface Link { href: string; name: string }

/** Build payload of /rides/<id> (src/lib/ride-payload.ts). Locale-dependent texts are formatted at build time. */
export interface RidePayload {
  id: string;
  name: string;
  /** "Outdoor · GravelRide" */
  kind: string;
  indoor: boolean;
  inStats: boolean;
  /** Date and start time. */
  when: string;
  zone: { zone: number; title: string; estimated: boolean } | null;
  gear: { name: string; href: string } | null;
  device: string | null;
  prs: number;
  /** Durations with a new all-time best, e.g. "5 s, 1 min". */
  newBests: string | null;
  strava: string | null;
  places: { name: string; href: string; title: string }[];
  older: Link | null;
  newer: Link | null;
  stats: {
    distance: number; moving: number; elapsed: number; elev: number; elevLow: number | null; elevHigh: number | null;
    speed: number; maxSpeed: number; w: number | null; maxW: number | null; np: number | null; hr: number | null; maxHr: number | null;
    cad: number | null; kcal: number | null; kj: number | null; tss: number | null; ftp: number; if_: number | null; re: number | null;
    temp: number | null; kg: number;
  };
  map: {
    /** The ride has chart streams (they load via chart-streams by the ride id). */
    streams: boolean;
    /** Route from the summary polyline – only when the streams have no GPS. */
    points: LatLng[] | null;
    /** Stream that colours the route, with its zones. */
    key: 'watts' | 'heart_rate' | null;
    zones: Zones | null;
  };
  /** Zones that colour the power and heart-rate streams. */
  streamZones: StreamZones;
  tiz: Record<'power' | 'hr', { seconds: readonly number[] | null; zones: Zones | null; label: string }>;
  year: number;
  ftp: number;
  curve: Omit<RideCurveProps, 'yearLabel' | 'ftp'>;
  analysis: { if_: number | null; vi: number | null; ef: number | null; rpe: number | null; dec: number | null; fuel: { during: string; ml: string; after: string } };
  laps: Lap[];
  segments: SegmentEffort[];
  splits: Split[];
}

function Pager({ older, newer }: Pick<RidePayload, 'older' | 'newer'>) {
  const item = (link: Link | null, label: string, aria: string, dir: 'older' | 'newer') => {
    const inner = dir === 'older' ? <><ChevronLeft aria-hidden="true" />{label}</> : <>{label}<ChevronRight aria-hidden="true" /></>;
    return link
      ? <Button asChild variant="outline" size="sm"><a href={link.href} title={link.name} aria-label={t(aria, { name: link.name })}>{inner}</a></Button>
      : <Button variant="outline" size="sm" disabled>{inner}</Button>;
  };
  return (
    <nav aria-label={t('ride.pager')} className="flex shrink-0 gap-2">
      {item(older, t('common.older'), 'ride.olderRide', 'older')}
      {item(newer, t('common.newer'), 'ride.newerRide', 'newer')}
    </nav>
  );
}

const Tag = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground [&_svg]:size-3', className)}>{children}</span>
);

function RideHeader({ R }: { R: RidePayload }) {
  const KindIcon = R.indoor ? House : Bike;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pt-2 pb-1">
      <div className="grid min-w-0 gap-2">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
          <KindIcon className="size-3.5" aria-hidden="true" />{R.kind}
          {!R.inStats && <Tag className="normal-case"><span title={t('ride.notInStatsTip')}>{t('ride.notInStats')}</span></Tag>}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{R.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{R.when}</span>
          {R.zone && <span className="inline-flex items-center gap-1">{R.zone.estimated && <span aria-hidden="true">≈</span>}<ZoneBadge zone={R.zone.zone} title={R.zone.title} /></span>}
          {R.gear && <a href={R.gear.href} className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"><Bike className="size-3" aria-hidden="true" />{R.gear.name}</a>}
          {R.device && <Tag><Cpu aria-hidden="true" />{R.device}</Tag>}
          {R.prs > 0 && <Tag><Trophy aria-hidden="true" />{t('common.prs', { n: R.prs })}</Tag>}
          {R.newBests && <Tag className="bg-brand-surface text-brand-surface-foreground"><Star aria-hidden="true" />{t('ride.newBests', { list: R.newBests })}</Tag>}
          {R.strava && <a href={R.strava} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">{t('common.strava')}<ExternalLink className="size-3" aria-hidden="true" /></a>}
        </div>
        {R.places.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <MapPin className="size-3.5 text-muted-foreground" aria-label={t('ride.places')} />
            {R.places.map((p, i) => (
              <React.Fragment key={p.href}>
                {i > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
                <a href={p.href} title={p.title} className="hover:underline focus-visible:underline">{p.name}</a>
              </React.Fragment>
            ))}
          </p>
        )}
      </div>
      <Pager older={R.older} newer={R.newer} />
    </header>
  );
}

interface StatItem { label: string; value: string; unit?: string; sub?: string }

function Stats({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3', className)}>
      {items.map((s) => (
        <div key={s.label} className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
          <dd className="text-lg font-semibold tracking-tight tabular-nums">
            {s.value}
            {s.unit && s.value !== '–' && <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">{s.unit}</span>}
          </dd>
          {s.sub && <dd className="truncate text-xs text-muted-foreground">{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function keyData(R: RidePayload): StatItem[] {
  const s = R.stats, m = (k: string) => t(`metric.${k}`);
  const items: StatItem[] = [
    { label: m('distance'), value: nf(s.distance, 1), unit: 'km' },
    { label: m('movingTime'), value: fmtDur(s.moving), sub: t('ride.totalTime', { t: fmtClock(s.elapsed) }) },
    { label: m('elevation'), value: nf(s.elev), unit: t('units.elev'), sub: s.elevHigh != null ? `${nf(s.elevLow)}–${nf(s.elevHigh)} m` : undefined },
    { label: m('avgSpeed'), value: nf(s.speed, 1), unit: 'km/h', sub: t('ride.maxSpeed', { v: nf(s.maxSpeed, 1) }) },
    { label: m('avgPower'), value: nf(s.w), unit: 'W', sub: s.w != null ? t('ride.powerSub', { wkg: nf(s.w / s.kg, 2), max: s.maxW ?? '–' }) : t('ride.noPowerMeter') },
    { label: t('ride.np'), value: nf(s.np), unit: 'W', sub: s.np ? `${nf(s.np / s.kg, 2)} W/kg` : undefined },
    { label: m('avgHr'), value: nf(s.hr), unit: 'bpm', sub: s.maxHr ? t('ride.maxHr', { v: s.maxHr }) : undefined },
    { label: m('avgCadence'), value: nf(s.cad), unit: 'rpm' },
    { label: m('calories'), value: nf(s.kcal), unit: 'kcal', sub: s.kj ? t('ride.work', { v: nf(s.kj) }) : undefined },
    { label: t('ride.tss'), value: nf(s.tss), unit: 'TSS', sub: `FTP ${s.ftp} W${s.if_ != null ? ` · IF ${nf(s.if_, 2)}` : ''}` },
    { label: t('ride.re'), value: nf(s.re) },
  ];
  if (s.temp != null) items.push({ label: t('ride.temp'), value: nf(s.temp), unit: '°C' });
  return items;
}

function Analysis({ R }: { R: RidePayload }) {
  const a = R.analysis;
  const dec = rideDecoupling(a.dec);
  return (
    <Card className="min-w-0" data-testid="ride-analysis">
      <CardHeader><CardLabel>{t('ride.analysis')}</CardLabel></CardHeader>
      <CardContent className="grid gap-5">
        <Stats className="sm:grid-cols-2" items={[
          { label: t('ride.if'), value: nf(a.if_, 2), sub: t('ride.ifTip') },
          { label: t('ride.vi'), value: nf(a.vi, 2), sub: t('ride.viTip') },
          { label: t('ride.ef'), value: nf(a.ef, 2), sub: t('ride.efTip') },
          { label: t('ride.rpe'), value: nf(a.rpe), unit: '/ 10' },
        ]} />
        <div className="grid gap-2">
          <h4 className="text-xs text-muted-foreground">{t('decoupling.title')}</h4>
          {dec ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-mono text-lg font-semibold tabular-nums">{dec.value}</span>
                <span className="text-muted-foreground">{dec.label}</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn('h-full rounded-full', toneBg(dec.tone))} style={{ width: `${dec.share}%` }} />
              </div>
              <DecouplingScale />
            </>
          ) : <p className="text-xs text-muted-foreground">{t('decoupling.onlyLongShort')}</p>}
        </div>
        <div className="grid gap-1 rounded-md bg-background p-3 text-xs">
          <h4 className="mb-1 font-medium">{t('fuel.title')}</h4>
          <p><span className="text-muted-foreground">{t('fuel.during')}</span> {a.fuel.during}</p>
          <p><span className="text-muted-foreground">{t('fuel.drink')}</span> {a.fuel.ml}</p>
          <p><span className="text-muted-foreground">{t('fuel.after')}</span> {a.fuel.after}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MapLegend({ zones }: { zones: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {Array.from({ length: zones }, (_, i) => (
        <li key={i} className="flex items-center gap-1"><span className={cn('size-2 rounded-[2px]', zoneBg(i + 1))} aria-hidden="true" />Z{i + 1}</li>
      ))}
      <li className="flex items-center gap-1"><span className="size-2 rounded-full bg-positive" aria-hidden="true" />{t('common.start')}</li>
      <li className="flex items-center gap-1"><span className="size-2 rounded-full bg-negative" aria-hidden="true" />{t('common.finish')}</li>
    </ul>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardLabel as="h2">{title}</CardLabel>
        {sub && <CardDescription className="text-xs">{sub}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

/** Ride detail (new UI): header with prev/next, route map, key data, streams, zones, power curve, analysis, tables. */
export function RideView({ R }: { R: RidePayload }) {
  useIslandReady();
  const stream = useChartStreams(R.map.streams ? R.id : null);
  const mapRef = React.useRef<RideMapHandle>(null);
  const latlng = stream?.latlng ?? null;
  const points = latlng ?? R.map.points;
  const values = latlng && stream && R.map.key ? stream[R.map.key] ?? null : null;
  const routeZones = values ? R.map.zones : null;
  const routeExpected = !!(R.map.points || (R.map.streams && stream === undefined));
  const onHover = React.useCallback((i: number | null) => {
    const p = i != null && latlng ? latlng[i] : null;
    mapRef.current?.mark(isLatLng(p) ? p : null);
  }, [latlng]);
  const mapSub = R.map.key === 'watts' ? t('ride.byPowerZone') : R.map.key === 'heart_rate' ? t('ride.byHrZone') : t('ride.routeSub');
  const prs = R.segments.filter((s) => s.pr_rank).length;

  return (
    <div className="grid gap-3 pb-3" data-testid="ride">
      <RideHeader R={R} />

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid lg:col-span-7" data-testid="ride-map">
          <ChartCard title={t('ride.route')} description={mapSub}>
            {points && points.length > 1 ? (
              <div className="grid gap-3">
                <div className="relative h-[340px] overflow-hidden rounded-md sm:h-[420px]">
                  <RideMap ref={mapRef} points={points} values={values} zones={routeZones} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  {routeZones && <MapLegend zones={routeZones.length} />}
                  {stream && <p className="text-xs text-muted-foreground" data-testid="map-tip">{t('ride.mapTip')}</p>}
                </div>
              </div>
            ) : routeExpected && stream === undefined ? (
              <Skeleton className="h-[340px] sm:h-[420px]" />
            ) : <EmptyState>{t('common.noGpsIndoor')}</EmptyState>}
          </ChartCard>
        </div>
        <Card className="min-w-0 lg:col-span-5">
          <CardHeader><CardLabel>{t('ride.keyData')}</CardLabel></CardHeader>
          <CardContent><Stats items={keyData(R)} /></CardContent>
        </Card>
      </div>

      <div data-testid="ride-streams" className="grid">
        <ChartCard title={t('ride.streams')} description={t('ride.streamsSub')}>
          {stream === undefined
            ? <Skeleton className="h-[520px]" />
            : stream ? <StreamCharts stream={stream} zones={R.streamZones} onHover={onHover} /> : <EmptyState>{t('common.noStreamsYet')}</EmptyState>}
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div data-testid="tiz-power" className="grid">
          <ChartCard title={t('ride.tizPower')} description={R.tiz.power.label}>
            <TimeInZones seconds={R.tiz.power.seconds} zones={R.tiz.power.zones} kind="power" />
          </ChartCard>
        </div>
        <div data-testid="tiz-hr" className="grid">
          <ChartCard title={t('ride.tizHr')} description={R.tiz.hr.label}>
            <TimeInZones seconds={R.tiz.hr.seconds} zones={R.tiz.hr.zones} kind="hr" />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div data-testid="ride-curve" className="grid lg:col-span-7">
          <ChartCard title={t('dash.card.curve')} description={t('ride.curveSub', { year: R.year })}>
            <RideCurveChart {...R.curve} yearLabel={R.year} ftp={R.ftp} />
          </ChartCard>
        </div>
        <div className="grid lg:col-span-5"><Analysis R={R} /></div>
      </div>

      {R.laps.length > 0 && (
        <Section title={t('ride.laps')} sub={t('ride.lapsSub', { n: R.laps.length })}><LapsTable laps={R.laps} /></Section>
      )}
      {R.segments.length > 0 && (
        <Section title={t('ride.segments')} sub={t('ride.segmentsSub', { n: R.segments.length }) + (prs ? t('ride.prPlacements', { n: prs }) : '')}>
          <SegmentsTable segments={R.segments} />
        </Section>
      )}
      {R.splits.length > 0 && (
        <Section title={t('ride.splits')}><SplitsTable splits={R.splits} /></Section>
      )}
    </div>
  );
}
