import * as React from 'react';
import { esc, fmtIso, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { NO_BIKE_COLOR } from '@/components/charts/categories';
import { homeRoutes } from './map-data.js';
import { useLeaflet, withColors } from './use-leaflet';

export type ColourMode = 'mono' | 'year' | 'bike';
export interface Route { i: string; n: string; d: string; y: number; g: string | null; k: number; t: string; ll: [number, number][]; bb: [number, number, number, number]; pl?: number[] }


export interface RouteMapProps {
  /** Routes drawn on the map. */
  routes: Route[];
  /** Routes a click on the map searches (the toolbar-filtered ones, regardless of the places selection). */
  candidates: Route[];
  colour: ColourMode;
  /** All years with routes, ascending (colour scale "by year"). */
  years: number[];
  /** Bike id → colour (shared bike palette, charts/categories.ts) for "by bike". */
  bikeColor: Record<string, string>;
  /** Fit the view to the shown routes whenever `key` changes; `home` = around the most frequent start. */
  fit: { mode: 'home' | 'all'; key: number };
  /** Marked spot of a click on the map. */
  spot: [number, number] | null;
  /** A click on the map: the ids of the rides passing within a few pixels (empty = none). */
  onSpot: (ids: Set<string>, at: [number, number]) => void;
}

const TOL = 10; // px around the click that count as "passes here"
function segDist2(p: any, a: any, b: any) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  let k = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0;
  k = Math.max(0, Math.min(1, k));
  const x = a.x + k * dx - p.x, y = a.y + k * dy - p.y;
  return x * x + y * y;
}
function spotSearch(map: any, latlng: any, list: Route[]) {
  const cp = map.latLngToLayerPoint(latlng);
  const mpp = (40075016.686 * Math.cos((latlng.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
  const pad = ((TOL * mpp) / 111320) * 1.6;
  const ids = new Set<string>();
  for (const r of list) {
    const [s, w, n, e] = r.bb;
    if (latlng.lat < s - pad || latlng.lat > n + pad || latlng.lng < w - pad * 1.6 || latlng.lng > e + pad * 1.6) continue;
    let prev = map.latLngToLayerPoint(r.ll[0]);
    for (let k = 1; k < r.ll.length; k++) {
      const cur = map.latLngToLayerPoint(r.ll[k]);
      if (segDist2(cp, prev, cur) <= TOL * TOL) { ids.add(r.i); break; }
      prev = cur;
    }
  }
  return ids;
}

/** The route heatmap (Leaflet, canvas renderer): every route a thin line, monochrome tiles. Client-only. */
export function RouteMap({ routes, candidates, colour, years, bikeColor, fit, spot, onSpot }: RouteMapProps) {
  const el = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef({ candidates, onSpot });
  latest.current = { candidates, onSpot };
  const { lf, theme } = useLeaflet(el, {
    canvas: true,
    init: ({ L, map }) => {
      map.on('click', (e: any) => {
        const ids = spotSearch(map, e.latlng, latest.current.candidates);
        latest.current.onSpot(ids, [e.latlng.lat, e.latlng.lng]);
      });
      return { layer: L.layerGroup().addTo(map), renderer: L.canvas({ padding: 0.5, tolerance: 6 }) };
    },
  });

  // Routes
  React.useEffect(() => {
    if (!lf) return;
    const { L, layer, renderer } = lf;
    layer.clearLayers();
    const span = years.length > 1 ? years[years.length - 1] - years[0] : 0;
    const colourOf = (r: Route) => {
      if (colour === 'year') return `color-mix(in oklab, var(--category-2) ${Math.round((span ? 1 - (r.y - years[0]) / span : 0) * 100)}%, var(--brand))`;
      if (colour === 'bike') return (r.g && bikeColor[r.g]) || NO_BIKE_COLOR;
      return 'var(--brand)';
    };
    const op = routes.length > 400 ? 0.28 : routes.length > 100 ? 0.45 : 0.75;
    withColors((css) => {
      const hover = css('var(--foreground)');
      for (const r of routes) {
        const c = css(colourOf(r));
        const pl = L.polyline(r.ll, { renderer, color: c, weight: 2.2, opacity: op, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
        pl.on('mouseover', () => { pl.setStyle({ weight: 5, opacity: 1, color: hover }); pl.bringToFront(); });
        pl.on('mouseout', () => pl.setStyle({ weight: 2.2, opacity: op, color: c }));
        pl.bindTooltip(`<b>${esc(r.n)}</b><br>${fmtIso(r.d)} · ${nf(r.k, 1)} km`, { sticky: true, direction: 'top' });
      }
    });
  }, [lf, routes, colour, years, bikeColor, theme]);

  // View
  React.useEffect(() => {
    if (!lf || !routes.length) return;
    const pts = fit.mode === 'home' ? homeRoutes(routes) : routes;
    const b = lf.L.latLngBounds(pts.flatMap((r: Route) => [r.ll[0], r.ll[Math.floor(r.ll.length / 2)], r.ll[r.ll.length - 1]]));
    lf.map.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on request, not on every filter change
  }, [lf, fit.key]);

  // Spot marker
  React.useEffect(() => {
    if (!lf || !spot) return;
    const pin = withColors((css) => lf.L.circleMarker(spot, { radius: 7, weight: 3, color: css('var(--background)'), fillColor: css('var(--foreground)'), fillOpacity: 1, interactive: false }).addTo(lf.map));
    return () => { pin.remove(); };
  }, [lf, spot, theme]);

  return <div ref={el} className="absolute inset-0" data-slot="leaflet" aria-label={t('map.mapLabel')} role="region" />;
}
