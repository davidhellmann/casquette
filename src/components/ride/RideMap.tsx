import * as React from 'react';
import type * as Leaflet from 'leaflet';
import { t } from '@/i18n/index.ts';
import { useLeaflet, withColors } from '@/components/map/use-leaflet';
import { rollingMean } from '@/lib/chart-streams.ts';
import { isLatLng, zoneRuns, type RoutePoint } from './ride-data.ts';

export type LatLng = [number, number];

export interface RideMapHandle {
  /** Mark a position on the route (stream hover); null hides the marker. */
  mark: (p: LatLng | null) => void;
}

export interface RideMapProps {
  points: readonly RoutePoint[];
  /** Values per point (watts or HR) and their zones – colour the route by zone; null = one colour. */
  values: (number | null)[] | null;
  zones: readonly { min: number | null; max: number | null }[] | null;
}

/** The ride's route on monochrome tiles, coloured by zone, with start/finish pins and a hover marker. Client-only. */
export const RideMap = React.forwardRef<RideMapHandle, RideMapProps>(function RideMap({ points, values, zones }, ref) {
  const el = React.useRef<HTMLDivElement>(null);
  const marker = React.useRef<Leaflet.CircleMarker | null>(null);
  const { lf, theme } = useLeaflet(el, { scrollZoomOnClick: true, init: ({ L, map }) => ({ layer: L.layerGroup().addTo(map) }) });

  const runs = React.useMemo(() => zoneRuns(points, values ? rollingMean(values, 3) : null, zones), [points, values, zones]);

  // Route
  React.useEffect(() => {
    if (!lf) return;
    const { L, layer } = lf;
    layer.clearLayers();
    const valid = points.filter(isLatLng);
    if (valid.length < 2) return;
    withColors((css) => {
      L.polyline(valid, { color: css('var(--card)'), weight: 9, opacity: 0.9, interactive: false }).addTo(layer);
      for (const run of runs) {
        L.polyline(run.points, { color: css(run.zone ? `var(--zone-${run.zone})` : 'var(--brand)'), weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
      }
      const pin = (p: LatLng, c: string) => L.circleMarker(p, { radius: 7, color: css('var(--card)'), weight: 3, fillColor: css(c), fillOpacity: 1, interactive: false }).addTo(layer);
      pin(valid[0], 'var(--positive)');
      pin(valid[valid.length - 1], 'var(--negative)');
      marker.current?.setStyle({ color: css('var(--card)'), fillColor: css('var(--foreground)') });
    });
  }, [lf, points, runs, theme]);

  // View: fit the route once it is known
  React.useEffect(() => {
    if (!lf) return;
    const valid = points.filter(isLatLng);
    if (valid.length > 1) lf.map.fitBounds(lf.L.latLngBounds(valid), { padding: [24, 24] });
  }, [lf, points]);

  React.useImperativeHandle(ref, () => ({
    mark(p) {
      if (!lf) return;
      if (!p) { marker.current?.remove(); return; }
      if (!marker.current) {
        marker.current = withColors((css) => lf.L.circleMarker(p, { radius: 7, color: css('var(--card)'), weight: 3, fillColor: css('var(--foreground)'), fillOpacity: 1, interactive: false, className: 'ride-hover-marker' }));
      }
      marker.current.setLatLng(p);
      if (!lf.map.hasLayer(marker.current)) {
        marker.current.addTo(lf.map);
        marker.current.getElement()?.setAttribute('data-hover-marker', '');
      }
    },
  }), [lf]);

  return <div ref={el} className="absolute inset-0" data-slot="leaflet" aria-label={t('ride.route')} role="region" />;
});
