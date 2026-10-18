import { describe, expect, it } from 'vitest';
import { compactRoute, routerUrl } from './demo-route-cache.mjs';
import { decodePolyline } from '../../../src/scripts/polyline.js';

const spec = { key: 'test-loop', profile: 'fastbike', waypoints: [[48.1, 11.5], [48.11, 11.52], [48.1, 11.5]] };

/** A BRouter-style GeoJSON answer: [lon, lat, elevation] per point. */
function brouterAnswer(coords) {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': '2000' }, geometry: { type: 'LineString', coordinates: coords } }] };
}

describe('routerUrl', () => {
  it('asks BRouter for a GeoJSON track through every waypoint (lon,lat order) with the route profile', () => {
    const url = new URL(routerUrl(spec));
    expect(url.origin + url.pathname).toBe('https://brouter.de/brouter');
    expect(url.searchParams.get('lonlats')).toBe('11.5,48.1|11.52,48.11|11.5,48.1');
    expect(url.searchParams.get('profile')).toBe('fastbike');
    expect(url.searchParams.get('format')).toBe('geojson');
  });
});

describe('compactRoute', () => {
  // 1 km straight east with many redundant points, then a 90° turn north.
  const straight = Array.from({ length: 101 }, (_, i) => [11.5 + i * 0.000134, 48.1, 500 + (i === 50 ? 1 : 0)]);
  const north = Array.from({ length: 50 }, (_, i) => [11.5134, 48.1 + (i + 1) * 0.00018, 500 + Math.max(0, i - 25) * 1.2]); // flat, then a climb
  const cached = compactRoute(spec, brouterAnswer([...straight, ...north]));

  it('drops redundant points on straight roads but keeps corners and both ends', () => {
    const pts = decodePolyline(cached.polyline);
    expect(pts.length).toBeLessThan(20);
    expect(pts[0]).toEqual([48.1, 11.5]);
    expect(pts.at(-1)).toEqual([48.109, 11.5134]);
    expect(pts.some(([lat, lng]) => Math.abs(lat - 48.1) < 1e-5 && Math.abs(lng - 11.5134) < 1e-5)).toBe(true);
  });

  it('keeps one elevation value (whole metres) per stored point, including where a straight road starts to climb', () => {
    expect(cached.elevation).toHaveLength(decodePolyline(cached.polyline).length);
    expect(cached.elevation[0]).toBe(500);
    expect(cached.elevation.at(-1)).toBe(529);
    expect(cached.elevation.length).toBeGreaterThanOrEqual(4); // the foot of the climb survives although the road is straight
  });

  it('records the waypoints and profile it was fetched with, so stale caches are detectable', () => {
    expect(cached.waypoints).toEqual(spec.waypoints);
    expect(cached.profile).toBe('fastbike');
  });

  it('rejects an answer without a track', () => {
    expect(() => compactRoute(spec, { type: 'FeatureCollection', features: [] })).toThrow(/test-loop/);
  });
});
