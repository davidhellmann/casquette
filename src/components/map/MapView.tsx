import * as React from 'react';
import { Maximize2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CardLabel } from '@/components/app/CardLabel';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { ALL, NO_GEO, filterRoutes, geoFromUrl, geoMatch, geoToUrl, placesBrowser, prepareRoutes } from './map-data.js';
import { PlacesPanel, type Geo, type PlacesTab } from './PlacesPanel';
import { NO_BIKE_COLOR } from '@/components/charts/categories';
import { RouteMap, type ColourMode, type Route } from './RouteMap';
import { useIslandReady } from '@/lib/island-ready';

export interface MapViewProps {
  years: number[];
  bikes: Bike[];
  types: { id: string; label: string }[];
}
/** A bike with routes; `color` from the shared bike palette (charts/categories.ts). */
type Bike = { id: string; name: string; color?: string };
type Source = { base: string; routes: Route[]; bikes: Bike[]; places: [string, string, string][] };
type Filters = { year: string; bike: string; type: string };

let cached: Source | null = null;
/** The build payload in #map-data, decoded once per page. */
function readSource(): Source {
  if (!cached) {
    const D = JSON.parse(document.getElementById('map-data')?.textContent || '{}');
    cached = { base: D.base || '/', routes: prepareRoutes(D.routes) as Route[], bikes: D.bikes || [], places: D.places || [] };
  }
  return cached;
}

const MOBILE = '(max-width: 1023px)';
const PAGE = 30;

function FilterSelect({ label, value, onChange, all, options }: { label: string; value: string; onChange: (v: string) => void; all?: string; options: { id: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="w-full min-w-0 bg-background sm:w-auto sm:min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all && <SelectItem value={ALL}>{all}</SelectItem>}
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Map page (new UI): route heatmap with toolbar filters, places browser in a side panel (sheet on phones). */
export function MapView({ years, bikes, types }: MapViewProps) {
  useIslandReady();
  const [S, setS] = React.useState<Source | null>(null);
  const [filters, setFilters] = React.useState<Filters>({ year: ALL, bike: ALL, type: ALL });
  const [colour, setColour] = React.useState<ColourMode>('mono');
  const [G, setG] = React.useState<Geo>(NO_GEO);
  const [spotAt, setSpotAt] = React.useState<[number, number] | null>(null);
  const [q, setQ] = React.useState('');
  const [tab, setTab] = React.useState<PlacesTab>('places');
  const [limit, setLimit] = React.useState(PAGE);
  const [fit, setFit] = React.useState<{ mode: 'home' | 'all'; key: number }>({ mode: 'home', key: 0 });
  const [sheet, setSheet] = React.useState(false);

  React.useEffect(() => {
    const src = readSource();
    const g = geoFromUrl(src.places, window.location.search);
    setS(src);
    setG(g);
    if (g.place != null) setTab('rides');
    setFit({ mode: g.country || g.region || g.place != null ? 'all' : 'home', key: 1 });
  }, []);

  // The selection is part of the URL (shareable, survives a reload)
  React.useEffect(() => {
    if (!S) return;
    const href = geoToUrl(S.places, G, window.location.href);
    if (href !== window.location.href) history.replaceState(null, '', href);
  }, [S, G]);

  const P = S?.places || [];
  const base = React.useMemo(() => (S ? filterRoutes(S.routes, filters) as Route[] : []), [S, filters]);
  const shown = React.useMemo(() => base.filter((r) => geoMatch(P, G, r)), [base, G]);
  const browser = React.useMemo(() => placesBrowser(P, base, G, q), [base, G, q]);
  const rides = React.useMemo(() => shown.slice().sort((a, b) => (a.d < b.d ? 1 : -1)), [shown]);
  const routeYears = React.useMemo(() => Array.from(new Set((S?.routes || []).map((r) => r.y))).sort((a, b) => a - b), [S]);
  const bikeColor = React.useMemo(() => Object.fromEntries((S?.bikes || []).map((b) => [b.id, b.color || NO_BIKE_COLOR])), [S]);
  const km = shown.reduce((s, r) => s + r.k, 0);

  const refit = () => setFit((f) => ({ mode: 'all', key: f.key + 1 }));
  const clearSpot = () => setSpotAt(null);
  const setFilter = (k: keyof Filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    clearSpot();
    setG((g) => ({ ...g, spot: null }));
    setLimit(PAGE);
    refit();
  };
  const onGeo = (patch: Partial<Geo>) => {
    const next = { ...G, spot: null, ...patch };
    const narrowed = (patch.country && patch.country !== G.country) || (patch.region && patch.region !== G.region) || (patch.place != null && patch.place !== G.place);
    clearSpot();
    setG(next);
    setLimit(PAGE);
    if (patch.place != null) { setTab('rides'); setQ(''); }
    if (patch.country !== undefined && patch.country !== G.country) setQ('');
    if (narrowed) refit();
  };
  const onSpot = React.useCallback((ids: Set<string>, at: [number, number]) => {
    setLimit(PAGE);
    if (!ids.size) { setSpotAt(null); setG((g) => ({ ...g, spot: null })); return; }
    setSpotAt(at);
    setG({ ...NO_GEO, spot: ids });
    setTab('rides');
    if (window.matchMedia(MOBILE).matches) setSheet(true);
  }, []);

  const panel = S && (
    <PlacesPanel P={P} browser={browser} G={G} onGeo={onGeo} q={q} onQ={setQ} tab={tab} onTab={setTab}
      rides={rides} limit={limit} onMore={() => setLimit((n) => n + PAGE)} base={S.base} />
  );

  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-[560px] flex-col gap-3 pb-4" data-testid="map-view">
      <h1 className="sr-only">{t('map.title')}</h1>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('map.filters')}>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <FilterSelect label={t('map.year')} value={filters.year} onChange={setFilter('year')} all={t('map.allYears')} options={years.map((y) => ({ id: String(y), label: String(y) }))} />
          <FilterSelect label={t('map.bike')} value={filters.bike} onChange={setFilter('bike')} all={t('map.allBikes')} options={bikes.map((b) => ({ id: b.id, label: b.name }))} />
          <FilterSelect label={t('map.type')} value={filters.type} onChange={setFilter('type')} all={t('map.allTypes')} options={types} />
          <FilterSelect label={t('map.colour')} value={colour} onChange={(v) => setColour(v as ColourMode)}
            options={[{ id: 'mono', label: t('map.heatmap') }, { id: 'year', label: t('map.byYear') }, { id: 'bike', label: t('map.byBike') }]} />
        </div>
        <Button variant="outline" size="sm" onClick={refit} disabled={!shown.length}><Maximize2 aria-hidden="true" />{t('map.fitAll')}</Button>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setSheet(true)}><MapPin aria-hidden="true" />{t('map.places')}</Button>
        <p className="ml-auto font-mono text-xs text-muted-foreground" data-testid="route-count" aria-live="polite">
          {S && t('map.count', { routes: t('map.routes', { n: nf(shown.length) }), km: nf(km) })}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-lg bg-card" data-testid="route-map">
            {S && <RouteMap routes={shown} candidates={base} colour={colour} years={routeYears} bikeColor={bikeColor} fit={fit} spot={spotAt} onSpot={onSpot} />}
          </div>
          <Legend colour={colour} years={routeYears} bikes={(S?.bikes || []).filter((b) => shown.some((r) => r.g === b.id))} />
        </div>
        <Card className="hidden w-[340px] shrink-0 gap-3 p-4 lg:flex xl:w-[380px]" data-testid="places-panel">
          <CardLabel as="h2">{t('map.places')}</CardLabel>
          {panel || <PanelSkeleton />}
        </Card>
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-[90vw] gap-0 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{t('map.places')}</SheetTitle>
            <SheetDescription className="text-xs">{t('map.placesSub')}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 px-4 pb-4">{panel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-2" aria-busy="true">
      <Skeleton className="h-9" />
      <Skeleton className="h-8" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-7" />)}
    </div>
  );
}

function Legend({ colour, years, bikes }: { colour: ColourMode; years: number[]; bikes: Bike[] }) {
  const cls = 'flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground';
  if (colour === 'year' && years.length > 1) return (
    <p className={cls}>
      <span>{t('map.legendYear')}</span>
      <span aria-hidden="true" className="h-1.5 w-40 rounded-xs bg-linear-to-r from-category-2 to-brand" />
      <span>{years[0]} – {years[years.length - 1]}</span>
    </p>
  );
  if (colour === 'bike') return (
    <ul className={cls}>
      {bikes.map((b) => (
        <li key={b.id} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1 w-3 rounded-xs" style={{ background: b.color || NO_BIKE_COLOR }} />{b.name}
        </li>
      ))}
    </ul>
  );
  return <p className={cls}>{t('map.legendHint')}</p>;
}
