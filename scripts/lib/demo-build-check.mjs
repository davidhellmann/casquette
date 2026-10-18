// The deploy's guard for the public demo (#54): proves that a demo build contains nothing but the
// synthetic demo dataset (demo/) and that it works under its base path. Fails on any ride, bike,
// segment or stream page that is not in demo/, on a build without the demo marker, and on
// root-relative links or assets outside the base path or without a file behind them.
// CLI: scripts/check-demo-build.mjs (`npm run demo:check`).
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { DEMO_MARKER, readDemoDataset } from './demo-dataset.mjs';

/** Every file below `dir`, as paths relative to it ('/'-separated). */
function walk(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const sub = rel ? `${rel}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(dir, sub) : [sub];
  });
}

const list = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

/** IDs of the demo dataset: rides and their segments, bikes, streams. */
function demoIds(dataset) {
  return {
    rides: new Set(dataset.rides.map((r) => String(r.id))),
    segments: new Set(dataset.rides.flatMap((r) => (r.segment_efforts ?? []).map((e) => e.segment_id))),
    gear: new Set(dataset.gear),
    streams: new Set(dataset.streams),
  };
}

/** The base path in the form Astro writes it: leading and trailing slash ('/', '/demo/', '/repo/demo/'). */
export function normaliseBase(base = '/') {
  const trimmed = base.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/** Root-relative URLs (`/…`, not `//…`) in an HTML or CSS file – links, assets and Astro island scripts. */
export function rootRelativeUrls(text) {
  const urls = [];
  for (const [, value] of text.matchAll(/\s(?:href|src|action|poster|component-url|renderer-url|before-hydration-url)\s*=\s*["'](\/(?!\/)[^"']*)["']/gi)) urls.push(value);
  for (const [, value] of text.matchAll(/\ssrcset\s*=\s*["']([^"']*)["']/gi)) {
    for (const candidate of value.split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (/^\/(?!\/)/.test(url)) urls.push(url);
    }
  }
  for (const [, value] of text.matchAll(/url\(\s*["']?(\/(?!\/)[^"')]*)["']?\s*\)/gi)) urls.push(value);
  return urls;
}

/** True when the URL path (inside the base) has a file in the build: the file itself or <dir>/index.html. */
function resolves(buildDir, base, url) {
  const rel = decodeURIComponent(url.split(/[?#]/)[0].slice(base.length));
  const file = path.join(buildDir, rel);
  if (!path.resolve(file).startsWith(path.resolve(buildDir))) return false;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return true;
  return fs.existsSync(path.join(file, 'index.html'));
}

const SECTIONS = [
  ['rides', 'rides', 'ride'],
  ['gear', 'gear', 'bike'],
  ['segments', 'segments', 'segment'],
];

/**
 * Checks a demo build. Returns the problems found (empty: the build is fine).
 * @param {{ build: string, root: string, base?: string }} options build folder, project root (holding demo/), base path
 * @returns {string[]}
 */
export function checkDemoBuild({ build, root, base = '/' }) {
  const buildDir = path.resolve(build);
  const prefix = normaliseBase(base);
  const index = path.join(buildDir, 'index.html');
  if (!fs.existsSync(index)) return [`no index.html in ${build}`];

  const problems = [];
  if (!fs.readFileSync(index, 'utf8').includes(DEMO_MARKER)) {
    problems.push(`index.html has no demo marker (${DEMO_MARKER}): the build did not use the demo dataset (DATA_SOURCE=demo)`);
  }

  const dataset = readDemoDataset({ root });
  const ids = demoIds(dataset);
  for (const [folder, key, what] of SECTIONS) {
    for (const entry of list(path.join(buildDir, folder))) {
      if (!entry.isDirectory()) continue;
      if (!ids[key].has(entry.name)) problems.push(`${folder}/${entry.name}: ${what} page that is not in the demo dataset`);
    }
  }

  for (const entry of list(path.join(buildDir, 'streams'))) {
    if (entry.name === '.gitkeep') continue;
    const id = entry.name.replace(/\.json$/, '');
    if (!entry.isFile() || !entry.name.endsWith('.json') || !ids.streams.has(id)) {
      problems.push(`streams/${entry.name}: stream that is not in the demo dataset`);
      continue;
    }
    let same = false;
    try {
      same = isDeepStrictEqual(
        JSON.parse(fs.readFileSync(path.join(buildDir, 'streams', entry.name), 'utf8')),
        JSON.parse(fs.readFileSync(path.join(dataset.dir, 'streams', entry.name), 'utf8')),
      );
    } catch { same = false; }
    if (!same) problems.push(`streams/${entry.name}: differs from the demo stream of the same name`);
  }

  const broken = new Map();
  for (const file of walk(buildDir).filter((f) => /\.(html|css)$/.test(f))) {
    for (const url of rootRelativeUrls(fs.readFileSync(path.join(buildDir, file), 'utf8'))) {
      let problem = null;
      if (!url.startsWith(prefix) && url !== prefix.slice(0, -1)) problem = `outside the base path ${prefix}`;
      else if (!resolves(buildDir, prefix, url)) problem = 'no file in the build';
      if (problem && !broken.has(url)) broken.set(url, `${file}: ${url} – ${problem}`);
    }
  }
  problems.push(...broken.values());
  return problems;
}
