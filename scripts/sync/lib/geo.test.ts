// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/env.ts', async (original) => ({ ...await original(), ROOT: `${process.cwd()}/logs/geo-config-fixture` }));
import { geocodeRides, isGeoRide, nominatimConfig, rideGeo, routeCells } from './geo.ts';

/** Google polyline encoding (the format of Strava's summary_polyline). */
function encode(points) {
  let out = '', prev = [0, 0];
  for (const p of points) {
    for (const k of [0, 1]) {
      const e5 = Math.round(p[k] * 1e5);
      let v = e5 - prev[k];
      prev[k] = e5;
      v = v < 0 ? ~(v << 1) : v << 1;
      while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
      out += String.fromCharCode(v + 63);
    }
  }
  return out;
}
// Due north from 48.000 °N in steps of 0.0045° (~500 m): about 1 km between every other point.
const north = (n) => Array.from({ length: n }, (_, i) => [48 + i * 0.0045, 11.5]);

describe('nominatimConfig', () => {
  it('asks Nominatim for English place names by default', () => {
    expect(nominatimConfig({}).lang).toBe('en');
  });

  it('uses GEO_LANG from the environment when set', () => {
    expect(nominatimConfig({ GEO_LANG: 'de' }).lang).toBe('de');
  });
});

describe('routeCells', () => {
  it('samples start, about every kilometre and finish, as unique grid cells in route order', () => {
    expect(routeCells(encode(north(7)))).toEqual(['3200:767', '3201:767', '3202:767']);
    // Back and forth over the same cells adds none.
    expect(routeCells(encode([...north(7), ...north(7).reverse()]))).toEqual(['3200:767', '3201:767', '3202:767']);
  });

  it('a single point is one cell; an empty route has none', () => {
    expect(routeCells(encode([[48, 11.5]]))).toEqual(['3200:767']);
    expect(routeCells('')).toEqual([]);
  });
});

describe('rideGeo', () => {
  const polyline = encode(north(7));
  const cells = {
    '3200:767': { n: 'Munich', r: 'Bavaria', c: 'DE' },
    '3201:767': { none: 1 },
    '3202:767': { n: 'Garching', r: 'Bavaria', c: 'DE' },
  };

  it('lists start, countries, regions and unique places along the route', () => {
    expect(rideGeo(polyline, cells)).toEqual({
      start: 'Munich', region: 'Bavaria', country: 'DE', countries: ['DE'], regions: ['Bavaria'],
      places: [{ name: 'Munich', region: 'Bavaria', country: 'DE' }, { name: 'Garching', region: 'Bavaria', country: 'DE' }],
    });
  });

  it('is null while a cell is unresolved or when no cell has a place', () => {
    const { '3202:767': _, ...incomplete } = cells;
    expect(rideGeo(polyline, incomplete)).toBeNull();
    expect(rideGeo(polyline, { '3200:767': { none: 1 }, '3201:767': { none: 1 }, '3202:767': { none: 1 } })).toBeNull();
    expect(rideGeo('', cells)).toBeNull();
  });
});

describe('geocodeRides', () => {
  it('skips indoor rides', () => {
    expect(isGeoRide({ summary_polyline: 'x', sport_type: 'Ride' })).toBe(true);
    expect(isGeoRide({ summary_polyline: 'x', sport_type: 'Ride', trainer: true })).toBe(false);
    expect(isGeoRide({ summary_polyline: 'x', sport_type: 'VirtualRide' })).toBe(false);
    expect(isGeoRide({ sport_type: 'Ride' })).toBe(false);
  });

  it('uses the place cache below the given root; a cache at the former location moves there on first use', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-'));
    try {
      const legacy = path.join(root, '.strava-cache', 'geo-cells.json');
      fs.mkdirSync(path.dirname(legacy), { recursive: true });
      fs.writeFileSync(legacy, JSON.stringify({ '3200:767': { n: 'Munich', r: 'Bavaria', c: 'DE' } }));
      const ride = { summary: { summary_polyline: encode([[48, 11.5]]), sport_type: 'Ride' } };
      const onRide = vi.fn();
      vi.stubGlobal('fetch', () => { throw new Error('No geocoding requests expected'); });
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await geocodeRides([ride], { root, onRide })).toEqual({ asked: 0, changed: 1, left: 0 });
      log.mockRestore();
      vi.unstubAllGlobals();
      expect(onRide).toHaveBeenCalledWith(ride);
      expect(ride.geo.start).toBe('Munich');
      expect(fs.existsSync(legacy)).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'src/data/geo-cells.json'), 'utf8'))).toHaveProperty('3200:767');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
