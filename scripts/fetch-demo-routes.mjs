#!/usr/bin/env node
/**
 * Refreshes the cached road geometries of the demo routes (Refs #25).
 *
 *   npm run demo:fetch-routes              # routes that are missing or whose waypoints changed
 *   npm run demo:fetch-routes -- --all     # every route again
 *   npm run demo:fetch-routes -- --only london-box-hill   # one route (or a city key)
 *
 * Asks the public BRouter instance (https://brouter.de, OpenStreetMap data) for a cycling
 * track through the waypoints in scripts/lib/demo-cities.mjs and writes the simplified
 * result to demo/source/routes/<city>.json. Polite by design: one request at a time, a
 * pause in between and an identifying User-Agent. Run `npm run demo:generate` afterwards.
 * This is the only demo script that uses the network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sleep } from './lib/env.mjs';
import { CITIES } from './lib/demo-cities.mjs';
import { compactRoute, renderRouteCache, routeCacheFile, routerUrl } from './lib/demo-route-cache.mjs';

const USER_AGENT = 'casquette-demo-routes/0.1 (one-off demo data refresh; https://github.com/davidhellmann/casquette)';
const PAUSE_MS = 2000;

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const all = process.argv.includes('--all');
const only = arg('--only');

async function fetchRoute(spec) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(routerUrl(spec), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json, application/json' } });
    if (res.ok) return compactRoute(spec, await res.json());
    const text = (await res.text()).slice(0, 200);
    const busy = res.status === 429 || res.status >= 500 || /watchdog|busy/i.test(text); // BRouter sheds load with a 400
    if (!busy) throw new Error(`Router HTTP ${res.status} for "${spec.key}": ${text}`);
    await sleep(PAUSE_MS * 5 * attempt);
  }
  throw new Error(`Router not responding for "${spec.key}".`);
}

let fetched = 0;
for (const city of CITIES) {
  const file = routeCacheFile(ROOT, city.key);
  const cached = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).routes : {};
  const routes = {};
  for (const spec of city.routes) {
    const old = cached[spec.key];
    const stale = !old || old.profile !== spec.profile || JSON.stringify(old.waypoints) !== JSON.stringify(spec.waypoints);
    const wanted = only ? only === spec.key || only === city.key : all || stale;
    if (!wanted) { routes[spec.key] = old; continue; }
    if (fetched) await sleep(PAUSE_MS);
    routes[spec.key] = await fetchRoute(spec);
    fetched++;
    console.log(`  ${spec.key}: ${routes[spec.key].elevation.length} points`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderRouteCache(routes));
}
console.log(fetched ? `Fetched ${fetched} route(s). Now run \`npm run demo:generate\`.` : 'All cached routes are up to date.');
