/**
 * Build payload of the map (/map) from the build dataset: the island's props (filter options) and the
 * route data for #map-data (every outdoor ride with a route; places once, referenced by index). Build time.
 */
import type { MapData, MapViewProps } from '../components/map/MapView';
import type { BuildDataset } from './build-dataset.ts';
import { bikeColors } from '../components/charts/categories';
import { rideDate } from '../training/index.ts';
import { t } from '../i18n/index.ts';

/** `props` for MapView, `json` (the escaped text of #map-data). */
export function mapPayload(data: BuildDataset): { props: MapViewProps; json: string } {
  const rides = data.rides.filter((r) => r.polyline && !r.indoor);
  const used = new Set(rides.map((r) => r.gear_id).filter(Boolean));
  const colorOf = bikeColors(data.gear.filter((g) => g.type === 'bike').map((g) => g.id));
  const bikes = data.gear.filter((g) => used.has(g.id)).map((g) => ({ id: g.id, name: g.name, color: colorOf[g.id] }));
  const years = Array.from(new Set(rides.map((r) => r.year))).sort((a, b) => b - a);
  const TYPES = t('map.types');
  const types = Array.from(new Set(rides.map((r) => r.sport_type))).map((id) => ({ id, label: TYPES[id] || id }));
  // Places table: each place once as [name, region, country]; rides reference it by index
  const placeIdx = new Map<string, number>();
  const places: MapData['places'] = [];
  const pIdx = (p: { name: string; region?: string; country?: string }) => {
    const k = `${p.country}|${p.region}|${p.name}`;
    if (!placeIdx.has(k)) { placeIdx.set(k, places.length); places.push([p.name, p.region || '', p.country || '']); }
    return placeIdx.get(k)!;
  };
  const routes: MapData['routes'] = rides.map((r) => ({
    i: r.id, n: r.name, d: rideDate(r), y: r.year, g: r.gear_id, k: +(r.distance / 1000).toFixed(1), t: r.sport_type, p: r.polyline,
    ...(r.geo ? { pl: r.geo.places.map(pIdx) } : {}),
  }));
  const map: MapData = { routes, bikes, places };
  return { props: { years, bikes, types }, json: JSON.stringify(map).replace(/</g, '\\u003c') };
}
