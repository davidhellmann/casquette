import * as React from 'react';
import { t } from '@/i18n/index.ts';
import { useLeaflet, withColors } from '@/components/map/use-leaflet';

/** The segment's route on a Leaflet map: the line, start (positive) and finish (negative). Client-only. */
export function SegmentMap({ latlng }: { latlng: [number, number][] }) {
  const el = React.useRef<HTMLDivElement>(null);
  const { lf, theme } = useLeaflet(el, { scrollZoomOnClick: true });

  React.useEffect(() => {
    if (!lf) return;
    const { L, map } = lf;
    const [halo, line, start, finish] = withColors((css) => ['var(--card)', 'var(--brand)', 'var(--positive)', 'var(--negative)'].map(css));
    const group = L.layerGroup().addTo(map);
    L.polyline(latlng, { color: halo, weight: 9, opacity: 0.9, interactive: false }).addTo(group);
    L.polyline(latlng, { color: line, weight: 5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
    const pin = (p: [number, number], c: string) => L.circleMarker(p, { radius: 6, color: halo, weight: 3, fillColor: c, fillOpacity: 1, interactive: false }).addTo(group);
    pin(latlng[0], start);
    pin(latlng[latlng.length - 1], finish);
    return () => { group.remove(); };
  }, [lf, latlng, theme]);

  React.useEffect(() => {
    if (lf) lf.map.fitBounds(lf.L.latLngBounds(latlng), { padding: [24, 24] });
  }, [lf, latlng]);

  return <div ref={el} className="absolute inset-0" data-slot="leaflet" aria-label={t('segments.mapLabel')} role="region" />;
}
