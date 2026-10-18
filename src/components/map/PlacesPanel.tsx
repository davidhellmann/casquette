import * as React from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmtIso, nf } from '@/scripts/format.js';
import { LOCALE, t } from '@/i18n/index.js';
import type { Route } from './RouteMap';

export interface Geo { country: string; region: string; place: number | null; spot: Set<string> | null }
export type PlacesTab = 'places' | 'rides';
type Browser = {
  countries: { code: string; n: number; km: number; share: number }[];
  regions: { name: string; n: number }[];
  places: { i: number; name: string; region: string; n: number; share: number }[];
  morePlaces: number;
};

export interface PlacesPanelProps {
  /** Places table: [name, region, country]. */
  P: [string, string, string][];
  browser: Browser;
  G: Geo;
  /** Change the places selection (clears a map spot). */
  onGeo: (patch: Partial<Geo>) => void;
  q: string;
  onQ: (q: string) => void;
  tab: PlacesTab;
  onTab: (tab: PlacesTab) => void;
  /** Routes on the map, newest first. */
  rides: Route[];
  limit: number;
  onMore: () => void;
  base: string;
}

const regionNames = (() => { try { return new Intl.DisplayNames([LOCALE], { type: 'region' }); } catch { return null; } })();
export const countryName = (c: string) => {
  if (!c) return t('map.unknown');
  try { return regionNames?.of(c) || c; } catch { return c; }
};

const listRow = 'relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';
const small = 'font-mono text-[11px] whitespace-nowrap text-muted-foreground';

/** A list entry with a thin bar showing its share of the largest entry. */
function ShareRow({ share, onClick, children, sub }: { share: number; onClick: () => void; children: React.ReactNode; sub: string }) {
  return (
    <button type="button" className={listRow} onClick={onClick}>
      <span className="truncate font-medium">{children}</span>
      <span className={small}>{sub}</span>
      <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-px bg-border">
        <span className="block h-full bg-muted-foreground/40" style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </span>
    </button>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-2 py-2 text-sm text-muted-foreground">{children}</p>;

/** Places browser (country → region → place) and the rides on the map. Used in the side panel and the mobile sheet. */
export function PlacesPanel({ P, browser, G, onGeo, q, onQ, tab, onTab, rides, limit, onMore, base }: PlacesPanelProps) {
  const chips: { key: string; label: string; clear: Partial<Geo> }[] = [];
  if (G.spot) chips.push({ key: 'spot', label: t('map.spot'), clear: {} });
  if (G.country) chips.push({ key: 'country', label: countryName(G.country), clear: { country: '', region: '', place: null } });
  if (G.region) chips.push({ key: 'region', label: G.region, clear: { region: '', place: null } });
  if (G.place != null) chips.push({ key: 'place', label: P[G.place][0], clear: { place: null } });
  const where = (r: Route) => (r.pl ? r.pl.slice(0, 8).map((i) => P[i][0]).join(' · ') + (r.pl.length > 8 ? ' …' : '') : '');
  const listing = q || G.country;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => onGeo(c.clear)} title={t('map.clear')}
              className="inline-flex h-6 items-center gap-1 rounded-sm bg-primary px-2 font-mono text-[11px] text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {c.label}<X className="size-3 opacity-70" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => onTab(v as PlacesTab)} className="min-h-0 flex-1">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="places">{t('map.places')}</TabsTrigger>
          <TabsTrigger value="rides">{t('map.ridesCount', { n: nf(rides.length) })}</TabsTrigger>
        </TabsList>

        <TabsContent value="places" className="flex min-h-0 flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={t('map.searchPlace')} aria-label={t('map.searchPlace')} autoComplete="off" className="h-8 pl-8" />
          </div>
          {G.country && (
            <button type="button" onClick={() => onGeo({ country: '', region: '', place: null })} className="inline-flex w-fit items-center gap-1 rounded-sm px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <ChevronLeft className="size-3.5" aria-hidden="true" />{t('map.allCountries')}
            </button>
          )}
          {G.country && !q && browser.regions.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('map.regions')}>
              {browser.regions.map((r) => (
                <button key={r.name} type="button" aria-pressed={G.region === r.name} onClick={() => onGeo({ region: G.region === r.name ? '' : r.name, place: null })}
                  className={cn('rounded-sm border px-2 py-0.5 font-mono text-[11px] outline-none hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    G.region === r.name ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground')}>
                  {r.name} · {nf(r.n)}
                </button>
              ))}
            </div>
          )}
          <div className="-mx-2 min-h-0 flex-1 overflow-auto px-2" data-testid="places-list">
            {!listing && (browser.countries.length
              ? browser.countries.map((c) => (
                <ShareRow key={c.code} share={c.share} sub={`${nf(c.n)} · ${nf(c.km)} km`} onClick={() => onGeo({ country: c.code, region: '', place: null })}>
                  {countryName(c.code)}<span className="ml-1.5 font-normal text-muted-foreground">{c.code}</span>
                </ShareRow>
              ))
              : <Empty>{t('map.noPlaces')}</Empty>)}
            {listing && (browser.places.length
              ? <>
                {browser.places.map((p) => (
                  <ShareRow key={p.i} share={p.share} sub={`${nf(p.n)}×`} onClick={() => onGeo({ place: G.place === p.i ? null : p.i })}>
                    {p.name}{!G.region && p.region && <span className="ml-1.5 font-normal text-muted-foreground">{p.region}</span>}
                  </ShareRow>
                ))}
                {browser.morePlaces > 0 && <Empty>{t('map.morePlaces', { n: nf(browser.morePlaces) })}</Empty>}
              </>
              : <Empty>{t(q ? 'map.noPlaceFound' : 'map.noPlacesShort')}</Empty>)}
          </div>
        </TabsContent>

        <TabsContent value="rides" className="-mx-2 min-h-0 overflow-auto px-2">
          {rides.length ? (
            <ul>
              {rides.slice(0, limit).map((r) => (
                <li key={r.i}>
                  <a href={`${base}rides/${r.i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <span className="truncate font-medium">{r.n}</span>
                    <span className={small}>{nf(r.k, 1)} km</span>
                    <span className="truncate text-xs text-muted-foreground">{where(r)}</span>
                    <span className={small}>{fmtIso(r.d)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <Empty>{t('map.noRides')}</Empty>}
          {rides.length > limit && (
            <button type="button" onClick={onMore} className="w-full rounded-md p-2 text-center font-mono text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {t('map.moreRides', { n: nf(Math.min(30, rides.length - limit)), left: nf(rides.length - limit) })}
            </button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
