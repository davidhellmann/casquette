import fs from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateDemoData, renderDemoFiles, type DemoData, type DemoRideFile } from './demo-data.ts';
import { CITIES, type DemoCity } from './demo-cities.ts';
import { loadRouteCache, metres, offSegment, ROUTE_ATTRIBUTION, routeCacheFile, type RouteCacheFile } from './demo-route-cache.ts';
import type { LatLng, RideGeo } from '../../shared/ride-file.ts';
import { ROOT } from '../../shared/env.ts';
import { rideSchema, gearSchema } from '../../../src/content-schemas.ts';
import { decodePolyline } from '../../../src/scripts/polyline.ts';
import { athleteTimeline, countsInStats } from '../../../src/training/index.ts';

let demo: DemoData;
beforeAll(() => {
  // The generator must work offline: any network access fails the whole suite.
  vi.stubGlobal('fetch', () => { throw new Error('demo:generate must not use the network'); });
  try { demo = generateDemoData(); } finally { vi.unstubAllGlobals(); }
}, 60_000); // generating the whole dataset can exceed the 10 s hook default on a busy machine

const cache = loadRouteCache(ROOT, CITIES.map((c) => c.key));
/** The city of an outdoor ride (every one has a `geo:` block in one of the five cities). */
const cityOf = (ride: DemoRideFile): DemoCity => CITIES.find((c) => c.country === ride.data.geo?.country)!;
/** Start date of a demo ride (always set). */
const localStart = (ride: DemoRideFile) => ride.data.start_date_local!;
/** The chart streams of a ride with a route. */
const streamsOf = (id: string) => demo.streams[id]!;
/** An outdoor ride: one with a route – and with it places, a distance and start and end points. */
type OutdoorRide = DemoRideFile & { data: { geo: RideGeo & { country: string }; distance: number; summary_polyline: string; start_latlng: LatLng; end_latlng: LatLng } };
const isOutdoor = (r: DemoRideFile): r is OutdoorRide => Boolean(r.data.summary_polyline);
const outdoorRides = () => demo.rides.filter(isOutdoor);

describe('demo data generator – deterministic and offline', () => {
  it('generates without any network access (fetch is stubbed to throw)', () => {
    expect(demo.rides.length).toBeGreaterThan(0);
  });

  it('never imports a network module', () => {
    for (const file of ['demo-data.ts', 'demo-cities.ts', 'demo-route-cache.ts']) {
      const src = fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/node:(https?|net|dgram)|\bfetch\(/);
    }
  });

  it('produces byte-identical files for the same seed', () => {
    const a = renderDemoFiles(generateDemoData({ seed: 7, weeks: 10 }));
    const b = renderDemoFiles(generateDemoData({ seed: 7, weeks: 10 }));
    expect(Object.keys(a).length).toBeGreaterThan(10);
    expect(a).toEqual(b);
  });

  it('produces a different dataset for another seed', () => {
    const a = renderDemoFiles(generateDemoData({ seed: 7, weeks: 10 }));
    const b = renderDemoFiles(generateDemoData({ seed: 8, weeks: 10 }));
    expect(a).not.toEqual(b);
  });

  it('does not depend on the current date', () => {
    expect(demo.data['meta.json'].newest_day).toBe(demo.rides.map((r) => localStart(r).slice(0, 10)).sort().pop());
  });
});

describe('demo data generator – valid for the app', () => {
  it('every ride and gear file passes the content collection schemas', () => {
    for (const r of demo.rides) expect(rideSchema.safeParse(r.data).success, r.file).toBe(true);
    for (const g of demo.gear) expect(gearSchema.safeParse(g.data).success, g.file).toBe(true);
  });

  it('spans a few years with a reasonable number of rides', () => {
    const years = new Set(demo.rides.map((r) => localStart(r).slice(0, 4)));
    expect(years.size).toBeGreaterThanOrEqual(3);
    expect(demo.rides.length).toBeGreaterThanOrEqual(150);
    expect(demo.rides.length).toBeLessThanOrEqual(300);
  });

  it('stores rides where the app expects them and links existing streams and gear', () => {
    const gearIds = new Set(demo.gear.map((g) => g.data.id));
    for (const r of demo.rides) {
      const d = r.data;
      expect(r.file).toBe(`rides/${d.start_date_local!.slice(0, 4)}/${d.start_date_local!.slice(0, 10)}_${d.id}.md`);
      if (d.streams) expect(demo.streams[d.id], d.id).toBeTruthy();
      if (d.gear_id) expect(gearIds.has(d.gear_id), d.gear_id).toBe(true);
    }
  });

  it('covers outdoor rides with routes and places, indoor rides, power and heart rate', () => {
    const outdoor = demo.rides.filter((r) => !r.data.trainer && r.data.sport_type !== 'VirtualRide');
    const indoor = demo.rides.filter((r) => r.data.trainer || r.data.sport_type === 'VirtualRide');
    expect(outdoor.length).toBeGreaterThan(50);
    expect(indoor.length).toBeGreaterThan(10);
    for (const r of outdoor) {
      expect(r.data.summary_polyline, r.file).toBeTruthy();
      expect(r.data.geo?.places?.length, r.file).toBeGreaterThan(0);
    }
    expect(demo.rides.some((r) => !countsInStats(r.data.sport_type))).toBe(true);
    const withPower = demo.rides.filter((r) => r.data.metrics?.power_curve);
    expect(withPower.length).toBeGreaterThan(100);
    expect(demo.rides.filter((r) => r.data.metrics?.hr_distribution).length).toBeGreaterThan(100);
  });

  it('repeats segments so segment pages have several efforts', () => {
    const count = new Map();
    for (const r of demo.rides) for (const s of r.data.segment_efforts) count.set(s.segment_id, (count.get(s.segment_id) || 0) + 1);
    expect([...count.values()].filter((n) => n >= 2).length).toBeGreaterThanOrEqual(5);
  });

  it('ships an athlete profile, goals and fitness history', () => {
    expect(demo.data['athlete.json'].profile.first_name).toBeTruthy();
    expect(demo.data['athlete.json'].zones.heart_rate_zones).toHaveLength(5);
    expect(demo.data['goals.json'].length).toBeGreaterThan(0);
    expect(demo.data['fitness-history.json'].length).toBeGreaterThan(1);
  });

  it('ships a zones file with dated HR zones that change within the demo period, power stays Coggan', () => {
    const zonesFile = demo.data['zones.json'];
    const timeline = athleteTimeline({ athlete: demo.data['athlete.json'], zonesFile });
    const days = demo.rides.map((r) => localStart(r).slice(0, 10)).sort();
    const first = timeline.at(days[0]).zones, last = timeline.at(days.at(-1)).zones;
    expect(first.source).toEqual({ hr: 'file', power: 'default' });
    expect(first.heart_rate_zones).not.toEqual(last.heart_rate_zones);
    // The current file entry matches the athlete's Strava zones.
    expect(last.heart_rate_zones).toEqual(demo.data['athlete.json'].zones.heart_rate_zones);
  });
});

describe('demo data generator – synthetic only', () => {
  it('never links to real Strava objects', () => {
    for (const r of demo.rides) {
      expect(r.data.id).toMatch(/^demo-/);
      for (const s of r.data.segment_efforts) expect(s.segment_id).toMatch(/^demo-/);
    }
  });

  it('keeps the shipped files compact', () => {
    const files = renderDemoFiles(demo);
    const bytes = Object.values(files).reduce((s, text) => s + Buffer.byteLength(text), 0);
    expect(bytes).toBeLessThan(8 * 1024 * 1024);
  });
});

/** Distance (m) from p to the closest cached road geometry of the city. */
function offRoad(p: LatLng, city: DemoCity): number {
  let best = Infinity;
  for (const route of city.routes) {
    const pts = cache[route.key].points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (p[0] < Math.min(a[0], b[0]) - 0.0005 || p[0] > Math.max(a[0], b[0]) + 0.0005) continue;
      if (p[1] < Math.min(a[1], b[1]) - 0.0008 || p[1] > Math.max(a[1], b[1]) + 0.0008) continue;
      best = Math.min(best, offSegment(p, a, b).d);
      if (best < 1) return best;
    }
  }
  return best;
}

describe('demo routes – cached road geometry', () => {
  it('has a cached geometry for every route, fetched with the waypoints and profile defined today', () => {
    for (const city of CITIES) {
      const file: RouteCacheFile = JSON.parse(fs.readFileSync(routeCacheFile(ROOT, city.key), 'utf8'));
      expect(file.attribution, city.key).toBe(ROUTE_ATTRIBUTION);
      expect(Object.keys(file.routes).sort(), city.key).toEqual(city.routes.map((r) => r.key).sort());
      for (const route of city.routes) {
        expect(file.routes[route.key].waypoints, route.key).toEqual(route.waypoints);
        expect(file.routes[route.key].profile, route.key).toBe(route.profile);
      }
    }
  });

  it('credits OpenStreetMap (ODbL) for the cached geometry', () => {
    expect(ROUTE_ATTRIBUTION).toMatch(/OpenStreetMap contributors/);
    expect(ROUTE_ATTRIBUTION).toMatch(/ODbL/);
  });

  it('defines 6–10 routes per city, with gravel, weekend and errand routes everywhere', () => {
    expect(CITIES.map((c) => c.name)).toEqual(['Munich', 'London', 'Paris', 'New York', 'Vancouver']);
    for (const city of CITIES) {
      expect(city.routes.length, city.key).toBeGreaterThanOrEqual(6);
      expect(city.routes.length, city.key).toBeLessThanOrEqual(10);
      for (const use of ['weekday', 'weekend', 'gravel', 'errand']) expect(city.routes.some((r) => r.use === use), `${city.key} ${use}`).toBe(true);
    }
  });
});

describe('demo rides – five real cities', () => {
  it('spreads the outdoor rides over all five cities', () => {
    const perCountry: Record<string, number> = {};
    for (const r of outdoorRides()) perCountry[r.data.geo.country] = (perCountry[r.data.geo.country] || 0) + 1;
    expect(Object.keys(perCountry).sort()).toEqual(['CA', 'DE', 'FR', 'GB', 'US']);
    for (const n of Object.values(perCountry)) expect(n).toBeGreaterThanOrEqual(10);
  });

  it('mixes short and long rides that all start and end at the rider\'s base', () => {
    const km = outdoorRides().map((r) => r.data.distance / 1000);
    expect(Math.min(...km)).toBeLessThan(15);
    expect(Math.max(...km)).toBeGreaterThan(90);
    for (const r of outdoorRides()) expect(metres(r.data.start_latlng, r.data.end_latlng), r.file).toBeLessThan(1500);
  });

  it('varies the turnaround point of out-and-back routes', () => {
    const outBack = CITIES.flatMap((c) => c.routes).filter((r) => r.kind === 'out-back' && r.turn[0] < r.turn[1]);
    expect(outBack.length).toBeGreaterThanOrEqual(5);
    // Rides that use the same out-and-back route mostly differ in length.
    const lengths = new Set(outdoorRides().map((r) => Math.round(r.data.distance / 500)));
    expect(lengths.size).toBeGreaterThan(40);
  });

  it('keeps every GPS point on the cached road geometry of its city', () => {
    for (const r of outdoorRides()) {
      const city = cityOf(r);
      expect(city, r.file).toBeTruthy();
      const track = streamsOf(r.data.id).latlng!.filter((q): q is LatLng => Boolean(q));
      for (const p of track.filter((_, i) => i % 4 === 0)) expect(offRoad(p, city), `${r.file} ${p}`).toBeLessThan(15);
    }
  });

  it('records the local time zone of the city', () => {
    for (const r of outdoorRides()) expect(r.data.timezone, r.file).toContain(cityOf(r).timezone);
  });

  it('has a distance that matches the length of its route', () => {
    for (const r of outdoorRides()) {
      const line = decodePolyline(r.data.summary_polyline);
      let m = 0;
      for (let i = 1; i < line.length; i++) m += metres(line[i - 1], line[i]);
      expect(r.data.distance / m, r.file).toBeGreaterThan(0.98);
      expect(r.data.distance / m, r.file).toBeLessThan(1.02);
    }
  });

  it('has roughly plausible altitudes per city', () => {
    const range: Record<string, { lo: number; hi: number }> = {};
    for (const r of outdoorRides()) {
      const k = cityOf(r).key, alt = streamsOf(r.data.id).altitude!.filter((a) => a != null);
      range[k] = { lo: Math.min(range[k]?.lo ?? Infinity, ...alt), hi: Math.max(range[k]?.hi ?? -Infinity, ...alt) };
    }
    expect(range.munich.lo).toBeGreaterThan(450); // Munich lies at ~520 m
    expect(range.munich.hi).toBeLessThan(800);
    for (const k of ['london', 'paris', 'new-york']) {
      expect(range[k].lo, k).toBeGreaterThan(-10);
      expect(range[k].hi, k).toBeLessThan(300);
    }
    expect(range.vancouver.hi).toBeGreaterThan(800); // Cypress Mountain
  });
});

describe('demo rides – places along the route', () => {
  it('names real towns of the ride\'s city, starting in the city itself', () => {
    for (const r of outdoorRides()) {
      const city = cityOf(r), geo = r.data.geo;
      expect(geo.start, r.file).toBe(city.name);
      expect(geo.countries, r.file).toEqual([city.country]);
      for (const p of geo.places) {
        const known = city.places.find((x) => x.name === p.name)!;
        expect(known, `${r.file} ${p.name}`).toBeTruthy();
        expect(p.region).toBe(known.region);
      }
    }
  });

  it('only lists places the track actually passes', () => {
    for (const r of outdoorRides()) {
      const city = cityOf(r), track = streamsOf(r.data.id).latlng!.filter((q): q is LatLng => Boolean(q));
      for (const p of r.data.geo.places) {
        const known = city.places.find((x) => x.name === p.name)!;
        const closest = Math.min(...track.map((q) => metres(q, known.at)));
        expect(closest / 1000, `${r.file} ${p.name}`).toBeLessThan(known.r + 0.5);
      }
    }
  });

  it('reaches the towns the famous routes are known for', () => {
    const seen = new Set(outdoorRides().flatMap((r) => r.data.geo.places.map((p) => p.name)));
    for (const name of ['Starnberg', 'Tutzing', 'Andechs', 'Kingston upon Thames', 'Westerham', 'Versailles', 'Chevreuse', 'Fort Lee', 'Nyack', 'West Vancouver', 'Richmond']) {
      expect(seen.has(name), name).toBe(true);
    }
    // The Hudson separates the 9W (New Jersey side) from Yonkers.
    for (const r of outdoorRides().filter((x) => x.data.geo.places.some((p) => p.name === 'Nyack'))) {
      expect(r.data.geo.places.map((p) => p.name), r.file).not.toContain('Yonkers');
    }
    const regions = new Set(outdoorRides().flatMap((r) => r.data.geo.regions));
    expect(regions).toEqual(new Set(['Bavaria', 'England', 'Île-de-France', 'New York', 'New Jersey', 'British Columbia']));
  });
});

describe('demo rides – segments on real roads', () => {
  const efforts = () => demo.rides.flatMap((r) => r.data.segment_efforts.map((e) => ({ ...e, ride: r })));
  const byName = (name: string) => efforts().filter((e) => e.name === name);

  it('only uses the curated segments of the ride\'s city, each ridden several times', () => {
    const count = new Map();
    for (const e of efforts()) {
      const city = cityOf(e.ride);
      expect(city.segments.some((s) => s.id === e.segment_id), `${e.ride.file} ${e.segment_id}`).toBe(true);
      count.set(e.segment_id, (count.get(e.segment_id) || 0) + 1);
    }
    for (const city of CITIES) {
      expect(city.segments.length, city.key).toBeGreaterThanOrEqual(3);
      for (const s of city.segments) expect(count.get(s.id) || 0, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('starts and ends every effort on the ride\'s own track', () => {
    for (const e of efforts()) {
      const seg = cityOf(e.ride).segments.find((s) => s.id === e.segment_id)!;
      const track = streamsOf(e.ride.data.id).latlng!.filter((q): q is LatLng => Boolean(q));
      for (const end of [seg.from, seg.to]) expect(Math.min(...track.map((q) => metres(q, end))), `${e.ride.file} ${seg.id}`).toBeLessThan(250);
    }
  });

  it('gives the famous climbs their real character', () => {
    const one = (name: string) => { const list = byName(name); expect(list.length, name).toBeGreaterThan(0); return list[0]; };
    expect(one('Box Hill Zig Zag').average_grade).toBeGreaterThan(3);
    expect(one('Box Hill Zig Zag').distance).toBeGreaterThan(2000);
    expect(one("Swain's Lane").average_grade).toBeGreaterThan(5);
    expect(one('Rue Lepic').average_grade).toBeGreaterThan(4);
    expect(one('Cypress Bowl Road').distance).toBeGreaterThan(8000);
    expect(one('Cypress Bowl Road').average_grade).toBeGreaterThan(5);
    expect(one('Alpine Approach').average_grade).toBeGreaterThan(4);
  });
});
