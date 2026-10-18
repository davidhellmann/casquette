// The website's deploy build (#55): copies website/ to an output folder, fills the legal
// placeholders from the environment and injects Cabin when SITE_CABIN_HOST is set (the pure
// steps: site-template.mjs). Optionally copies a demo build into <out>/demo/ and injects Cabin
// there too. CLI: scripts/site/site-build.mjs (`npm run site:build`); variables: website/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { injectCabin, readSiteEnv, renderPage, SiteBuildError } from './site-template.mjs';

/** Files of website/ that are notes for the repository, not part of the site. */
const SKIP = new Set(['README.md']);

/** Every file below `dir`, as paths relative to it. */
function walk(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const sub = path.join(rel, entry.name);
    return entry.isDirectory() ? walk(dir, sub) : [sub];
  });
}

const inside = (child, parent) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/**
 * Builds the site. `out` is emptied first, so it must not be (or contain) the source folders.
 * @param {{ src: string, out: string, env?: Record<string, string | undefined>, demo?: string | null, log?: (line: string) => void }} options
 * @returns {{ pages: string[], demoPages: string[], cabinHost: string | null }} pages as paths relative to `out`
 */
export function buildSite({ src, out, env = process.env, demo = null, log = () => {} }) {
  const config = readSiteEnv(env);
  const [srcDir, outDir, demoDir] = [src, out, demo].map((p) => (p ? path.resolve(p) : null));
  if (!fs.existsSync(path.join(srcDir, 'index.html'))) throw new SiteBuildError(`Site build: no index.html in ${src}`);
  if (demoDir && !fs.existsSync(path.join(demoDir, 'index.html'))) throw new SiteBuildError(`Site build: no index.html in the demo folder ${demo}`);
  for (const source of [srcDir, demoDir].filter(Boolean)) {
    if (inside(source, outDir) || inside(outDir, source)) throw new SiteBuildError(`Site build: the output folder ${out} must be separate from ${source}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  const pages = [];
  for (const rel of walk(srcDir)) {
    if (SKIP.has(path.basename(rel))) continue;
    const target = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (rel.endsWith('.html')) {
      fs.writeFileSync(target, renderPage(fs.readFileSync(path.join(srcDir, rel), 'utf8'), config, rel));
      pages.push(rel);
    } else {
      fs.copyFileSync(path.join(srcDir, rel), target);
    }
  }

  const demoPages = [];
  if (demoDir) {
    const demoOut = path.join(outDir, 'demo');
    fs.cpSync(demoDir, demoOut, { recursive: true });
    for (const rel of walk(demoOut).filter((f) => f.endsWith('.html'))) {
      const file = path.join(demoOut, rel);
      const html = fs.readFileSync(file, 'utf8');
      const injected = injectCabin(html, config.cabinHost);
      if (injected !== html) fs.writeFileSync(file, injected);
      demoPages.push(path.join('demo', rel));
    }
  }

  log(`Site build: ${pages.length} website HTML files${demoDir ? ` + ${demoPages.length} demo HTML files` : ''} → ${out}`);
  log(config.cabinHost ? `Cabin: https://${config.cabinHost}/hello.js on every page` : 'Cabin: off (SITE_CABIN_HOST not set)');
  return { pages, demoPages, cabinHost: config.cabinHost };
}
