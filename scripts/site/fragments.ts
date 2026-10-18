#!/usr/bin/env node
// @ts-nocheck – typed in phase B of docs/adr/0004
// Refs #46: real UI fragments for the website (website/ui/) from the demo build.
//
//   npm run fragments              # demo build → serve → capture → website/ui/
//   npm run fragments -- --check   # same, but only compares with website/ui/ (exit 1 if outdated)
//
// Builds the demo dataset (DATA_SOURCE=demo, fixed clock) into dist-fragments/, serves it on a free
// port and drives the local Chromium: each piece is loaded in light and dark, its rendered DOM
// (charts already drawn as SVG) stripped to static markup, and the app's CSS scoped to the fragment
// wrapper. The route map is an image crop. Details: website/ui/README.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { captureWebp, launchBrowser, openDemoPage, waitUntilReady } from './lib/capture.ts';
import { heroRide, readDemoDataset, reviewYear } from './lib/demo-dataset.ts';
import { ROOT } from '../shared/env.ts';
import { serveStatic } from './lib/static-server.ts';
import { collectMedia, collectSelectors, parseCss, scopeCss } from './lib/css-scope.ts';
import {
  DESCENDANT_RESET, MAP, MAP_SCALE, PIECES, SCOPE_CLASS, TIME_ZONE, VIEWPORT, WRAPPER_RESET,
  STYLE_PROPS, appFonts, assertStatic, cleanTree, diffStyles, fixedNow, inlineRemToPx, keepAttribute, manifestEntry, piecePath, previewPage, renameRefs,
  snapshotStyles, wrapFragment,
} from './lib/fragments.ts';

const OUT_DIR = path.join(ROOT, 'website', 'ui');
const DIST = path.join(ROOT, 'dist-fragments');
/** Hand-written files in the output folder; everything else there is generated and replaced. */
const KEEP_FILES = new Set(['README.md', 'OFL.txt']);

const { values: args } = parseArgs({ options: { check: { type: 'boolean', default: false }, 'no-build': { type: 'boolean', default: false } } });

function build(now) {
  console.log(`Building the demo (clock ${now}, ${TIME_ZONE}) into ${path.relative(ROOT, DIST)}/ …`);
  const clock = path.join(ROOT, 'scripts', 'site', 'lib', 'fixed-clock.ts');
  const res = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'astro'), ['build', '--outDir', DIST], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, DATA_SOURCE: 'demo', TZ: TIME_ZONE, FRAGMENTS_NOW: now, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${clock}`.trim() },
  });
  if (res.status !== 0) throw new Error('Demo build failed');
}

/** A page of the demo build (served at `base`) in `theme`, with the demo's clock, time zone and locale. */
const openPage = (browser, { base, url, theme, now, scale = 1 }) =>
  openDemoPage(browser, base + url, { theme, viewport: VIEWPORT, scale, now, timeZone: TIME_ZONE, locale: 'en-US' });

/**
 * Runs in the page: the piece's element, reduced to `keep`, cleaned; its markup, chart CSS, size and
 * computed styles (to check the fragment against).
 */
function extract(piece, keep, clean, snapshot, props) {
  const root = [...document.querySelectorAll(piece.root)].find((el) => !piece.label || el.textContent.trim().startsWith(piece.label));
  if (!root) return { error: `${piece.root} ${piece.label ?? ''} not found` };
  if (piece.keep) for (const child of [...root.children]) if (!piece.keep.some((s) => child.matches(s))) child.remove();
  const css = clean(root, keep);
  const { width, height } = root.getBoundingClientRect();
  root.style.width = `${width}px`; // the charts are drawn for this width
  const html = root.outerHTML;
  // The chart colours left with their <style> elements – back for the reference snapshot
  const style = document.createElement('style');
  style.textContent = css.join('\n');
  document.head.append(style);
  return { html, css: css.join('\n'), width: Math.ceil(width), height: Math.ceil(height), styles: snapshot(root, props) };
}

async function capturePiece(browser, opts, piece) {
  const { page, errors, close } = await openPage(browser, opts);
  try {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView(), piece.root);
    await waitUntilReady(page, piece.root);
    const fn = `(${extract})(${JSON.stringify(piece)}, ${keepAttribute}, ${cleanTree}, ${snapshotStyles}, ${JSON.stringify(STYLE_PROPS)})`;
    const res = await page.evaluate(fn);
    if (res.error) throw new Error(`${opts.url}: ${res.error}`);
    if (errors.length) throw new Error(`${opts.url}: page errors: ${errors.join('; ')}`);
    const head = await page.evaluate(() => ({
      sheets: [...document.styleSheets].map((s) => s.href).filter(Boolean),
      styles: [...document.head.querySelectorAll('style')].map((s) => s.textContent),
    }));
    return { ...res, head };
  } finally { await close(); }
}

async function captureMap(browser, opts) {
  const { page, close } = await openPage(browser, { ...opts, scale: MAP_SCALE });
  try {
    await waitUntilReady(page, MAP.root);
    const box = await page.evaluate((sel) => { scrollTo(0, 0); const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, MAP.root);
    return { image: await captureWebp(page, box), width: Math.round(box.width), height: Math.round(box.height) };
  } finally { await close(); }
}

/** Selectors used by the fragments and the layout media queries at the capture viewport – asked in a page holding all of them. */
async function cascadeFacts(browser, html, selectors, media) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    return await page.evaluate(({ selectors, media }) => {
      const pseudo = /::?(?:before|after|backdrop|placeholder|marker|selection|file-selector-button|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g;
      const test = (s) => { try { return !!document.querySelector(s.replace(pseudo, '').trim() || '*'); } catch { return true; } };
      const used = new Set(selectors.filter(test));
      document.documentElement.classList.add('dark');
      selectors.filter((s) => !used.has(s) && test(s)).forEach((s) => used.add(s));
      return { used: [...used], media: Object.fromEntries(media.map((m) => [m, matchMedia(m).matches])) };
    }, { selectors, media });
  } finally { await context.close(); }
}

async function generate(outDir) {
  const { meta } = readDemoDataset();
  const now = fixedNow(meta.newest_day);
  if (!args['no-build']) build(now);
  else if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`No build in ${path.relative(ROOT, DIST)}/ – run without --no-build.`);
  // The dataset as the build on the fixed clock sees it
  const { rides } = readDemoDataset({ today: new Date(now) });
  const vars = { ride: heroRide(rides), year: reviewYear(rides) };

  const server = await serveStatic(DIST);
  const browser = await launchBrowser();
  try {
    const fragments = [];
    const sheets = new Set();
    let head = null;
    for (const piece of PIECES) {
      const url = piecePath(piece, vars);
      const shots = {};
      for (const theme of ['light', 'dark']) shots[theme] = await capturePiece(browser, { base: server.url, url, theme, now }, piece);
      head ??= shots.light.head;
      shots.light.head.sheets.forEach((s) => sheets.add(s));
      // One fragment for both themes: the app's colours are CSS variables, so the markup must not differ
      if (shots.light.html !== shots.dark.html) {
        const at = [...shots.light.html].findIndex((c, i) => c !== shots.dark.html[i]);
        throw new Error(`${piece.name}: light and dark markup differ near "${shots.light.html.slice(Math.max(0, at - 60), at + 60)}"`);
      }
      const refs = renameRefs(shots.light.html, shots.light.css, piece.name);
      const html = inlineRemToPx(refs.html);
      const { css } = refs;
      assertStatic(html, piece.name);
      const entry = manifestEntry(piece, { width: shots.light.width, height: shots.light.height, url });
      fragments.push({ piece, entry, css, styles: { light: shots.light.styles, dark: shots.dark.styles }, html: wrapFragment({ name: piece.name, html, width: entry.width, height: entry.height }) });
      console.log(`${piece.name.padEnd(10)} ${String(entry.width).padStart(5)}×${String(entry.height).padEnd(5)} ${(html.length / 1024).toFixed(0).padStart(4)} KB  ${url}`);
    }

    const maps = {};
    for (const theme of ['light', 'dark']) maps[theme] = await captureMap(browser, { base: server.url, url: MAP.path, theme, now });
    const map = { name: MAP.name, light: `${MAP.name}-light.webp`, dark: `${MAP.name}-dark.webp`, width: maps.light.width, height: maps.light.height, scale: MAP_SCALE, anchor: MAP.anchor, source: MAP.path, note: MAP.note };
    console.log(`${'map'.padEnd(10)} ${String(map.width).padStart(5)}×${String(map.height).padEnd(5)} ${(maps.light.image.length / 1024).toFixed(0).padStart(4)} KB  ${MAP.path} (light), ${(maps.dark.image.length / 1024).toFixed(0)} KB (dark)`);

    // Stylesheet: the app CSS + the fragments' chart colours, reduced to what the fragments use, scoped
    const appCss = await Promise.all([...sheets].map(async (href) => (await fetch(href)).text()));
    const nodes = parseCss([...appCss, ...fragments.map((f) => f.css)].join('\n'));
    const facts = await cascadeFacts(browser, fragments.map((f) => f.html).join('\n'), [...collectSelectors(nodes)], [...collectMedia(nodes)]);
    const used = new Set(facts.used);
    const headNodes = head.styles.flatMap((s) => parseCss(s));
    const fonts = appFonts(
      [...new Set(headNodes.filter((n) => n.name === 'font-face').map((n) => n.decls))],
      headNodes.filter((n) => n.type === 'rule' && n.selector === ':root').flatMap((n) => n.decls.split(';')),
    );
    const css = scopeCss(nodes, { scope: `.${SCOPE_CLASS}`, used: (s) => used.has(s), media: (m) => facts.media[m], wrapper: [WRAPPER_RESET, ...fonts.props].join(';'), reset: DESCENDANT_RESET });
    const stylesheet = `/* Generated by \`npm run fragments\` from the demo build: the app's CSS for the UI fragments, scoped to .${SCOPE_CLASS}. Do not edit. */\n`
      + `${nodes.banners.join('\n')}\n${fonts.faces.map((f) => `@font-face{${f}}`).join('')}${css}\n`;

    // Output (into an empty folder)
    fs.mkdirSync(path.join(outDir, 'fonts'), { recursive: true });
    for (const { url, file } of fonts.files) fs.writeFileSync(path.join(outDir, 'fonts', file), Buffer.from(await (await fetch(new URL(url, server.url))).arrayBuffer()));
    fs.writeFileSync(path.join(outDir, 'ui.css'), stylesheet);
    for (const f of fragments) fs.writeFileSync(path.join(outDir, f.entry.file), f.html);
    fs.writeFileSync(path.join(outDir, map.light), maps.light.image);
    fs.writeFileSync(path.join(outDir, map.dark), maps.dark.image);
    fs.writeFileSync(path.join(outDir, 'fragments.json'), `${JSON.stringify({ generated: 'npm run fragments', clock: now, viewport: VIEWPORT, scope: `.${SCOPE_CLASS}`, stylesheet: 'ui.css', fragments: fragments.map((f) => f.entry), map }, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'index.html'), previewPage(fragments, map));
    console.log(`ui.css     ${(stylesheet.length / 1024).toFixed(0).padStart(16)} KB  (${used.size} of ${collectSelectors(nodes).size} selectors in use)`);
    await verify(browser, outDir, fragments);
  } finally {
    await browser.close();
    await server.close();
  }
}

/** The written fragments, rendered from the preview page, must compute the same styles and boxes as in the app. */
async function verify(browser, outDir, fragments) {
  const server = await serveStatic(outDir);
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme, reducedMotion: 'reduce' }); // no transitions while ui.css loads
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('requestfailed', (r) => errors.push(`${r.url()} failed`));
      await page.goto(`${server.url}/index.html`);
      await page.evaluate(() => document.fonts.ready);
      for (const f of fragments) {
        const got = await page.evaluate(`(${snapshotStyles})(document.querySelector('[data-fragment="${f.entry.name}"] > *'), ${JSON.stringify(STYLE_PROPS)})`);
        const diffs = diffStyles(f.styles[theme], got);
        if (diffs.length) throw new Error(`${f.entry.name} (${theme}) renders differently from the app:\n  ${diffs.slice(0, 8).join('\n  ')}`);
      }
      await context.close();
      if (errors.length) throw new Error(`Preview (${theme}): ${errors.join('; ')}`);
    }
    console.log('verified   every fragment computes the same styles and boxes as the app (light and dark)');
  } finally { await server.close(); }
}

/** Generated files that differ between `a` and `b` (map crops only by presence: the tiles change upstream). */
function compare(a, b) {
  const list = (d) => fs.readdirSync(d, { recursive: true }).filter((f) => !KEEP_FILES.has(f) && fs.statSync(path.join(d, f)).isFile()).sort();
  const files = [...new Set([...list(a), ...list(b)])];
  return files.filter((f) => {
    const [x, y] = [path.join(a, f), path.join(b, f)];
    if (!fs.existsSync(x) || !fs.existsSync(y)) return true;
    return !f.endsWith('.webp') && !fs.readFileSync(x).equals(fs.readFileSync(y));
  });
}

async function main() {
  // Generated and verified in a temporary folder first: website/ui/ only changes after a clean run
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casquette-fragments-'));
  try {
    await generate(tmp);
    if (args.check) {
      const stale = compare(OUT_DIR, tmp);
      if (stale.length) {
        console.error(`website/ui/ is out of date (${stale.join(', ')}). Run \`npm run fragments\`.`);
        process.exitCode = 1;
      } else console.log('website/ui/ is up to date.');
      return;
    }
    for (const f of fs.readdirSync(OUT_DIR)) if (!KEEP_FILES.has(f)) fs.rmSync(path.join(OUT_DIR, f), { recursive: true, force: true });
    fs.cpSync(tmp, OUT_DIR, { recursive: true });
    console.log(`→ ${path.relative(ROOT, OUT_DIR)}/ (preview: ${path.relative(ROOT, path.join(OUT_DIR, 'index.html'))})`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
