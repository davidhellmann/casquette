import * as React from 'react';
import { THEME_EVENT } from '@/lib/theme.ts';

/**
 * Shared Leaflet setup of the map islands (route map, ride map, segment map): loads Leaflet
 * (`src/scripts/map.ts`) on the client, creates the map with OSM tiles and attribution, keeps its
 * size in sync with the container and re-renders on theme changes.
 */

export interface LeafletMap { L: any; map: any }

export interface LeafletOptions<T> {
  /** Draw vectors on one canvas (thousands of routes) instead of SVG. */
  canvas?: boolean;
  /** Scroll-wheel zoom only after a click into the map, so the page scrolls past it. */
  scrollZoomOnClick?: boolean;
  /** Runs once after the map exists – add handlers and layers; the returned object is part of the result. */
  init?: (lf: LeafletMap) => T;
}

/** The Leaflet map in `el` (null until loaded) and a counter that changes with the theme – a dependency for re-colouring. */
export function useLeaflet<T extends object = {}>(el: React.RefObject<HTMLDivElement | null>, { canvas = false, scrollZoomOnClick = false, init }: LeafletOptions<T> = {}) {
  const [lf, setLf] = React.useState<(LeafletMap & T) | null>(null);
  const [theme, setTheme] = React.useState(0);
  const initRef = React.useRef(init);
  initRef.current = init;

  React.useEffect(() => {
    let map: any, ro: ResizeObserver | undefined, gone = false;
    import('@/scripts/map.ts').then(({ L, addTiles }) => {
      if (gone || !el.current) return;
      map = L.map(el.current, { zoomControl: true, attributionControl: true, preferCanvas: canvas, scrollWheelZoom: !scrollZoomOnClick });
      addTiles(map);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      if (scrollZoomOnClick) {
        map.on('click', () => map.scrollWheelZoom.enable());
        map.on('mouseout', () => map.scrollWheelZoom.disable());
      }
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el.current);
      const extra = initRef.current?.({ L, map }) ?? ({} as T);
      setLf({ L, map, ...extra });
    });
    const onTheme = () => setTheme((n) => n + 1);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => { gone = true; ro?.disconnect(); map?.remove(); window.removeEventListener(THEME_EVENT, onTheme); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once per mount
  }, []);

  return { lf, theme };
}

/**
 * Resolves CSS colours (`var(--token)`, `color-mix()`) to values Leaflet's canvas/SVG renderer
 * understands, while `draw` runs. The one place the app reads colours with getComputedStyle
 * (DESIGN.md): Leaflet paints on a canvas, which cannot resolve custom properties.
 */
export function withColors<R>(draw: (color: (css: string) => string) => R): R {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const cache = new Map<string, string>();
  try {
    return draw((css) => {
      if (!cache.has(css)) { probe.style.color = css; cache.set(css, getComputedStyle(probe).color); }
      return cache.get(css)!;
    });
  } finally {
    probe.remove();
  }
}
