/** Leaflet helpers for the map islands (route map, ride map, segment map). */
// Leaflet ships no types and @types/leaflet is not installed yet, so `L` is untyped here.
// @ts-expect-error TS7016 – remove together with this note once @types/leaflet is a dev dependency
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { t } from '../i18n/index.ts';

/* Free OpenStreetMap tiles (no key). Monochrome and dark mode via a CSS filter on
   `[data-slot="leaflet"] .leaflet-tile-pane` (app.css), so one tile URL serves both themes.
   Usage policy: https://operations.osmfoundation.org/policies/tiles/ – fine for a personal dashboard. */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' + t('map.attribution');

/** The base map (OSM tiles + attribution) on a Leaflet map (`L.Map`). */
export const addTiles = (map: unknown): unknown => L.tileLayer(TILE_URL, { attribution: ATTR, maxZoom: 19 }).addTo(map);

export { L };
