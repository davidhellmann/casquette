import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Refs #13: the sync never reads from or writes into the demo dataset (demo/), and the demo tools
// never touch your own data. scripts/ is split by data side, so the rule follows the folders:
// - scripts/sync/   the sync: Strava and Nominatim, your own rides, gear, athlete files and caches
// - scripts/site/   the demo dataset, the demo build checks, screenshots, website fragments, brand
// - scripts/shared/ what both need (ride file, metrics, YAML, athlete file shapes, env helpers)
// Only the guard tests in scripts/ itself sit outside the three folders.
const root = path.resolve(import.meta.dirname, '..');
const scriptsDir = path.join(root, 'scripts');
const SIDES = ['sync', 'site', 'shared'];
/** Which side may import which; src/ (the app's pure modules) is open to all of them. */
const MAY_IMPORT = { sync: ['sync', 'shared', 'src'], site: ['site', 'shared', 'src'], shared: ['shared', 'src'] };
/** Your own data, as listed in .gitignore – the site side and shared code never name these paths. */
const PERSONAL_PATHS = [
  'src/content/rides', 'src/content/gear', 'public/streams', '.strava-cache', '.strava-token.json',
  'src/data/athlete.json', 'src/data/fitness-history.json', 'src/data/geo-cells.json', 'src/data/goals.json', 'src/data/zones.json',
];

const files = fs.readdirSync(scriptsDir, { recursive: true })
  .filter((f) => /\.m?js$/.test(f))
  .map((f) => f.split(path.sep).join('/'));
const read = (f) => fs.readFileSync(path.join(scriptsDir, f), 'utf8');
const sideOf = (f) => (SIDES.includes(f.split('/')[0]) ? f.split('/')[0] : null);
const onSide = (...sides) => files.filter((f) => sides.includes(sideOf(f)));

/** Relative module specifiers: static and dynamic imports, re-exports and vi.mock. */
function relativeImports(source) {
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)(['"])(\.\.?\/[^'"]+)\1/g;
  return [...source.matchAll(re)].map((m) => m[2]);
}

/** Where an import from `file` lands: a side folder, or the top-level folder outside scripts/. */
function targetOf(file, spec) {
  const abs = path.resolve(path.dirname(path.join(scriptsDir, file)), spec);
  const inScripts = path.relative(scriptsDir, abs);
  const area = inScripts.startsWith('..') ? path.relative(root, abs).split(path.sep)[0] : sideOf(inScripts.split(path.sep).join('/'));
  return { abs, area };
}

/** `a/b/c` written as a path string or as path.join segments ('a', 'b', 'c'). */
const pathPattern = (p) => new RegExp(p.split('/').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(`(?:/|['"\`]\\s*,\\s*['"\`])`));

describe('scripts are split into a sync side and a site side', () => {
  it('puts every script into sync/, site/ or shared/ (only the guard tests stay in scripts/)', () => {
    expect(onSide('sync').length).toBeGreaterThan(5);
    expect(onSide('site').length).toBeGreaterThan(5);
    expect(files.filter((f) => !sideOf(f) && !/^[^/]+\.test\.js$/.test(f))).toEqual([]);
  });

  it('keeps imports within the side: sync never imports site, site never imports sync, shared imports neither', () => {
    const crossing = [];
    for (const f of onSide(...SIDES)) {
      for (const spec of relativeImports(read(f))) {
        const { abs, area } = targetOf(f, spec);
        if (!fs.existsSync(abs)) crossing.push(`${f} → ${spec} (missing)`);
        else if (!MAY_IMPORT[sideOf(f)].includes(area)) crossing.push(`${f} → ${spec} (${area})`);
      }
    }
    expect(crossing).toEqual([]);
  });

  it('finds the imports it checks (static, dynamic, mocked, across folders)', () => {
    const sync = read('sync/strava-sync.mjs');
    expect(relativeImports(sync)).toEqual(expect.arrayContaining(['../shared/env.mjs', './lib/strava.mjs']));
    expect(relativeImports(read('sync/lib/rebuild.test.js'))).toContain('../../shared/env.mjs');
    expect(targetOf('site/lib/demo-data.mjs', '../../sync/lib/strava.mjs').area).toBe('sync');
    expect(targetOf('site/lib/demo-data.mjs', '../../../src/training/index.js').area).toBe('src');
  });
});

it('keeps every sync script away from the demo data', () => {
  // Everything outside the site side – sync, shared code and the guard tests – never names the demo.
  const others = files.filter((f) => sideOf(f) !== 'site' && f !== 'demo-isolation.test.js');
  expect(others.length).toBeGreaterThan(5);
  expect(others.filter((f) => /\bdemo\b/i.test(read(f)))).toEqual([]);
});

it('keeps the demo tools away from your own data', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const p of PERSONAL_PATHS) expect(ignore, p).toContain(p);
  const touching = onSide('site', 'shared').flatMap((f) => {
    const source = read(f);
    return PERSONAL_PATHS.filter((p) => pathPattern(p).test(source)).map((p) => `${f}: ${p}`);
  });
  expect(touching).toEqual([]);
  expect(pathPattern('src/data/goals.json').test(`path.join(ROOT, 'src', 'data/goals.json')`)).toBe(true);
});

it('keeps the Strava and Nominatim adapters on the sync side', () => {
  // Their endpoints (API, OAuth, reverse geocoding); a link to an activity page is just data.
  const endpoint = /strava\.com\/(?:api|oauth)|nominatim/i;
  expect(onSide('sync').filter((f) => endpoint.test(read(f))).length).toBeGreaterThan(1);
  expect(files.filter((f) => sideOf(f) !== 'sync' && f !== 'demo-isolation.test.js' && endpoint.test(read(f)))).toEqual([]);
});

it('tracks the demo data in git, separate from the ignored real data folders', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  expect(ignore).not.toMatch(/^\/?demo\b/m);
  expect(ignore).toMatch(/^src\/content\/rides\/\*\*$/m);
});
