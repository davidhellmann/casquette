/**
 * Cached road geometries for the demo dataset (Refs #25).
 *
 * The demo routes (scripts/lib/demo-cities.mjs) are hand-picked waypoints in real cities.
 * `npm run demo:fetch-routes` asks an OpenStreetMap-based cycling router (BRouter) once for
 * a road-following track through those waypoints and stores it compactly in
 * demo/source/routes/<city>.json. `npm run demo:generate` only ever reads that cache – it
 * never touches the network, so the demo dataset stays offline and byte-deterministic.
 *
 * Geometry © OpenStreetMap contributors, available under the Open Database License (ODbL);
 * routed with BRouter (brouter.de), elevation from SRTM via BRouter.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePolyline } from '../../src/scripts/polyline.js';

export const ROUTER_ENDPOINT = 'https://brouter.de/brouter';
export const ROUTE_ATTRIBUTION = 'Route geometry © OpenStreetMap contributors (ODbL, https://www.openstreetmap.org/copyright). Routed with BRouter (https://brouter.de); elevation from SRTM via BRouter.';

/** Simplification tolerances: horizontal (metres off the line) and vertical (metres off the gradient). */
const TOL_M = 6;
const TOL_ELE = 4;

/** BRouter request for one route: GeoJSON track (with elevation) through every waypoint. */
export function routerUrl(spec) {
  const lonlats = spec.waypoints.map(([lat, lng]) => `${lng},${lat}`).join('|');
  return `${ROUTER_ENDPOINT}?lonlats=${lonlats}&profile=${spec.profile}&alternativeidx=0&format=geojson`;
}

/* ---------------- Polyline ---------------- */
/** [[lat,lng], …] → Google encoded polyline (precision 5, ≈ 1 m). */
export function encodePolyline(points) {
  let out = '', plat = 0, plng = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5);
    out += enc(a - plat) + enc(b - plng);
    plat = a; plng = b;
  }
  return out;
}

/* ---------------- Geometry ---------------- */
const RAD = Math.PI / 180;
/** Great-circle distance in metres. */
export function metres(a, b) {
  const dl = (b[0] - a[0]) * RAD, dn = (b[1] - a[1]) * RAD;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dn / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

/** Distance (m) of p from segment a–b, plus the position (0…1) of the foot point. */
export function offSegment(p, a, b) {
  const kx = 111320 * Math.cos(a[0] * RAD), ky = 110540;
  const bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  const px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  const f = len2 ? Math.min(1, Math.max(0, (px * bx + py * by) / len2)) : 0;
  return { d: Math.hypot(px - f * bx, py - f * by), f };
}

/** Douglas-Peucker on [lat, lng, ele]: keeps a point if it bends the line or the gradient. */
function simplify(pts) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let worst = -1, score = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const { d, f } = offSegment(pts[i], pts[i0], pts[i1]);
      const ele = Math.abs(pts[i][2] - (pts[i0][2] + (pts[i1][2] - pts[i0][2]) * f));
      const s = Math.max(d / TOL_M, ele / TOL_ELE);
      if (s > score) { score = s; worst = i; }
    }
    if (score > 1) { keep[worst] = 1; stack.push([i0, worst], [worst, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Router answer (BRouter GeoJSON) → compact cache entry for one route. */
export function compactRoute(spec, geojson) {
  const coords = geojson?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error(`No track in the router answer for route "${spec.key}".`);
  const pts = coords.map(([lng, lat, ele]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, Number(ele) || 0]);
  const kept = simplify(pts);
  return {
    profile: spec.profile,
    waypoints: spec.waypoints,
    polyline: encodePolyline(kept),
    elevation: kept.map((p) => Math.round(p[2])),
  };
}

/* ---------------- Cache files ---------------- */
/** demo/source/routes/<city>.json – tracked in git, written only by `npm run demo:fetch-routes`. */
export const routeCacheFile = (root, city) => path.join(root, 'demo', 'source', 'routes', `${city}.json`);

/** Text of one city cache file (stable key order, one route per line block). */
export function renderRouteCache(routes) {
  return JSON.stringify({ attribution: ROUTE_ATTRIBUTION, routes }, null, 1) + '\n';
}

/** Reads the cached routes of every city: { [routeKey]: { profile, waypoints, points: [[lat,lng]], elevation } }. */
export function loadRouteCache(root, cityKeys) {
  const out = {};
  for (const city of cityKeys) {
    const file = routeCacheFile(root, city);
    if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(root, file)} – run \`npm run demo:fetch-routes\`.`);
    const { routes } = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, r] of Object.entries(routes)) out[key] = { ...r, points: decodePolyline(r.polyline) };
  }
  return out;
}
