import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// Refs #13: the sync never reads from or writes into the demo dataset (demo/).
// Only the generator and its tests may touch it.
const root = path.resolve(import.meta.dirname, '..');
const DEMO_TOOLS = new Set([
  'generate-demo.mjs', path.join('lib', 'demo-data.mjs'), path.join('lib', 'demo-data.test.js'), 'demo-isolation.test.js',
  // Refs #25: real-road demo routes (city definitions, route cache and its refresh script).
  'fetch-demo-routes.mjs', path.join('lib', 'demo-cities.mjs'), path.join('lib', 'demo-route-cache.mjs'), path.join('lib', 'demo-route-cache.test.js'),
  // Refs #14: product screenshots are taken from the demo data only.
  'screenshots.mjs', path.join('lib', 'screenshots.mjs'), path.join('lib', 'screenshots.test.js'),
  // Refs #46: the website's UI fragments are captured from the demo build only.
  'fragments.mjs', path.join('lib', 'fragments.mjs'), path.join('lib', 'fragments.test.js'), path.join('lib', 'fixed-clock.mjs'),
  // Refs #55: the website build copies a demo *build* (--demo) into the Pages artifact – never the dataset.
  'site-build.mjs', path.join('lib', 'site-build.mjs'), path.join('lib', 'site-template.test.js'),
  // Refs #54: the deploy's check that the demo build contains only the demo dataset (reads demo/, never writes).
  'check-demo-build.mjs', path.join('lib', 'demo-build-check.mjs'), path.join('lib', 'demo-build-check.test.js'),
  // The demo dataset as the build sees it, and the capture of demo build pages (read-only).
  path.join('lib', 'demo-dataset.mjs'), path.join('lib', 'demo-dataset.test.js'), path.join('lib', 'capture.mjs'),
]);

it('keeps every sync script away from the demo data', () => {
  const files = fs.readdirSync(path.join(root, 'scripts'), { recursive: true })
    .filter((f) => /\.m?js$/.test(f) && !DEMO_TOOLS.has(f));
  expect(files.length).toBeGreaterThan(5);
  const touching = files.filter((f) => /\bdemo\b/i.test(fs.readFileSync(path.join(root, 'scripts', f), 'utf8')));
  expect(touching).toEqual([]);
});

it('tracks the demo data in git, separate from the ignored real data folders', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  expect(ignore).not.toMatch(/^\/?demo\b/m);
  expect(ignore).toMatch(/^src\/content\/rides\/\*\*$/m);
});
