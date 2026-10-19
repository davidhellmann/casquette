#!/usr/bin/env node
/**
 * Regenerates the synthetic demo dataset in demo/ (rides, gear, streams, data).
 *
 *   npm run demo:generate               # default seed
 *   npm run demo:generate -- --seed 42  # another dataset
 *
 * Deterministic and offline: the same seed always writes identical files. Routes come from
 * the cached road geometry in demo/source/routes/ (refresh with `npm run demo:fetch-routes`).
 * Run it after schema changes and commit the result. Never touches real (synced) data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../shared/env.ts';
import { DEFAULT_SEED, generateDemoData, renderDemoFiles } from './lib/demo-data.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const seed = Number(arg('--seed') ?? DEFAULT_SEED);
if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');

const DEMO = path.join(ROOT, 'demo');
const files = renderDemoFiles(generateDemoData({ seed }));

for (const dir of ['rides', 'gear', 'streams', 'data']) fs.rmSync(path.join(DEMO, dir), { recursive: true, force: true });
let bytes = 0;
for (const [rel, text] of Object.entries(files)) {
  const file = path.join(DEMO, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  bytes += Buffer.byteLength(text);
}
const rides = Object.keys(files).filter((f) => f.startsWith('rides/')).length;
console.log(`Demo data written to demo/: ${rides} rides, ${Object.keys(files).length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (seed ${seed}).`);
