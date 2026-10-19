/** Map page (/map): route data, toolbar filters and the places browser (country → region → place). Pure, no DOM. */
import { decodePolyline } from '@/scripts/polyline.ts';
import type { Route } from './RouteMap';
import type { RouteData } from './MapView';
import type { Geo } from './PlacesPanel';

/** Places table of the build payload: [name, region, country], referenced by index. */
export type PlaceRow = [name: string, region: string, country: string];

export const ALL = 'all';

/** Decodes the build payload: every route with its points and bounding box [s, w, n, e]. */
export function prepareRoutes(raw: readonly RouteData[] | null | undefined): Route[] {
  return (raw || []).map((r) => {
    const ll = decodePolyline(r.p);
    let s = 90, n = -90, w = 180, e = -180;
    for (const [la, lo] of ll) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
    const bb: Route['bb'] = [s, w, n, e];
    return { ...r, ll, bb };
  }).filter((r) => r.ll.length > 1);
}

/** Routes matching the toolbar filters (year, bike, type; `ALL` = no filter). */
export function filterRoutes<R extends Pick<Route, 'y' | 'g' | 't'>>(routes: readonly R[], { year, bike, type }: { year: string; bike: string; type: string }): R[] {
  return routes.filter((r) => (year === ALL || String(r.y) === year) && (bike === ALL || r.g === bike) && (type === ALL || r.t === type));
}

/** Empty places selection. `spot` = ids of the rides through a clicked spot on the map. */
export const NO_GEO: Geo = { country: '', region: '', place: null, spot: null };

const inGeo = (P: readonly PlaceRow[], G: Geo, i: number) => (!G.country || P[i][2] === G.country) && (!G.region || P[i][1] === G.region);

/** Does a route match the places selection (spot, place, or country/region)? */
export function geoMatch(P: readonly PlaceRow[], G: Geo, r: Pick<Route, 'i' | 'pl'>): boolean {
  if (G.spot) return G.spot.has(r.i);
  if (G.place != null) return !!r.pl && r.pl.includes(G.place);
  if (G.country || G.region) return !!r.pl && r.pl.some((i) => inGeo(P, G, i));
  return true;
}

const norm = (s: string | null | undefined) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * The places browser for the filtered routes: countries (independent of the selection), regions of
 * the selected country, and places in the selected country/region (optionally matching `q`).
 * Lists are sorted by ride count; `share` = count relative to the first entry (0–1).
 */
export function placesBrowser(P: readonly PlaceRow[], base: readonly Pick<Route, 'pl' | 'k'>[], G: Geo, q = '', limit = 80) {
  const cs = new Map<string, { n: number; km: number }>();
  for (const r of base) if (r.pl) {
    for (const c of new Set(r.pl.map((i) => P[i][2]))) { const o = cs.get(c) || { n: 0, km: 0 }; o.n++; o.km += r.k; cs.set(c, o); }
  }
  const countries = [...cs.entries()].sort((a, b) => b[1].n - a[1].n).map(([code, o]) => ({ code, ...o }));

  const rs = new Map<string, number>();
  if (G.country) for (const r of base) if (r.pl) {
    for (const x of new Set(r.pl.filter((i) => P[i][2] === G.country).map((i) => P[i][1]).filter(Boolean))) rs.set(x, (rs.get(x) || 0) + 1);
  }
  const regions = [...rs.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));

  const ps = new Map<number, number>();
  for (const r of base) if (r.pl) for (const i of new Set(r.pl)) if (inGeo(P, G, i)) ps.set(i, (ps.get(i) || 0) + 1);
  const nq = norm(q);
  const all = [...ps.entries()].filter(([i]) => !nq || norm(P[i][0]).includes(nq))
    .sort((a, b) => b[1] - a[1] || P[a[0]][0].localeCompare(P[b[0]][0]))
    .map(([i, n]) => ({ i, name: P[i][0], region: P[i][1], n }));
  const places = all.slice(0, nq ? 200 : limit);

  const share = <T>(list: T[], n: (x: T) => number) => list.map((x) => ({ ...x, share: list.length ? n(x) / n(list[0]) : 0 }));
  return {
    countries: share(countries, (x) => x.n),
    regions,
    places: share(places, (x) => x.n),
    morePlaces: all.length - places.length,
  };
}

/** "Home" = the 0.1° cell with the most ride starts; the routes starting near it (if more than 5). */
export function homeRoutes<R extends Pick<Route, 'll'>>(list: R[]): R[] {
  if (!list.length) return list;
  const cnt: Record<string, number> = {};
  list.forEach((r) => { const k = `${r.ll[0][0].toFixed(1)},${r.ll[0][1].toFixed(1)}`; cnt[k] = (cnt[k] || 0) + 1; });
  const [hk] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  const [hl, hn] = hk.split(',').map(Number);
  const near = list.filter((r) => Math.abs(r.ll[0][0] - hl) < 0.6 && Math.abs(r.ll[0][1] - hn) < 0.9);
  return near.length > 5 ? near : list;
}

/* ---------- URL (?country=AT&region=…&place=…) – shareable and linkable ---------- */
// Links from before the English rename used ?land=…&ort=…; they still open the same selection.
const LEGACY_PARAMS = new Map([['country', 'land'], ['place', 'ort']]);

/** The places selection from a URL's search params (unknown places are ignored). */
export function geoFromUrl(P: readonly PlaceRow[], search: string): Geo {
  const u = new URLSearchParams(search);
  const param = (k: string) => {
    const legacy = LEGACY_PARAMS.get(k);
    return u.get(k) ?? (legacy ? u.get(legacy) : null);
  };
  const country = (param('country') || '').toUpperCase(), region = param('region') || '', place = param('place');
  const G: Geo = { ...NO_GEO, country, region };
  if (place) {
    const i = P.findIndex((p) => p[0] === place && (!country || p[2] === country) && (!region || p[1] === region));
    if (i >= 0) G.place = i;
  }
  return G;
}

/** `href` with the places selection in its search params. */
export function geoToUrl(P: readonly PlaceRow[], G: Geo, href: string): string {
  const u = new URL(href);
  ['country', 'region', 'place', ...LEGACY_PARAMS.values()].forEach((k) => u.searchParams.delete(k));
  if (G.country) u.searchParams.set('country', G.country);
  if (G.region) u.searchParams.set('region', G.region);
  if (G.place != null) u.searchParams.set('place', P[G.place][0]);
  return u.href;
}
