// The website's deploy build (#55): copies website/ to an output folder, fills the legal
// placeholders from the environment and injects Cabin when SITE_CABIN_HOST is set (the pure
// steps: site-template.ts). Optionally copies a demo build into <out>/demo/ and injects Cabin
// there too. CLI: scripts/site/site-build.ts (`npm run site:build`); variables: website/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { injectCabin, readSiteEnv, renderPage, SiteBuildError, type SiteEnv } from './site-template.ts';

/** Files of website/ that are notes for the repository, not part of the site. */
const SKIP = new Set(['README.md']);

/** Every file below `dir`, as paths relative to it. */
function walk(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const sub = path.join(rel, entry.name);
    return entry.isDirectory() ? walk(dir, sub) : [sub];
  });
}

const inside = (child: string, parent: string) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/** What to build: the website folder, the output folder, the variables and an optional demo build. */
export type BuildSiteOptions = {
  src: string;
  out: string;
  env?: SiteEnv;
  /** A demo build to copy into `<out>/demo/`. */
  demo?: string | null;
  log?: (line: string) => void;
};

/** What was built: HTML pages as paths relative to `out`, and the Cabin host used. */
export type BuildSiteResult = { pages: string[]; demoPages: string[]; cabinHost: string | null };

/** Builds the site. `out` is emptied first, so it must not be (or contain) the source folders. */
export function buildSite({ src, out, env = process.env, demo = null, log = () => {} }: BuildSiteOptions): BuildSiteResult {
  const config = readSiteEnv(env);
  const srcDir = path.resolve(src);
  const outDir = path.resolve(out);
  const demoDir = demo ? path.resolve(demo) : null;
  if (!fs.existsSync(path.join(srcDir, 'index.html'))) throw new SiteBuildError(`Site build: no index.html in ${src}`);
  if (demoDir && !fs.existsSync(path.join(demoDir, 'index.html'))) throw new SiteBuildError(`Site build: no index.html in the demo folder ${demo}`);
  for (const source of [srcDir, demoDir].filter((dir) => dir !== null)) {
    if (inside(source, outDir) || inside(outDir, source)) throw new SiteBuildError(`Site build: the output folder ${out} must be separate from ${source}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  const pages: string[] = [];
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

  const demoPages: string[] = [];
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
