// @ts-nocheck – typed in phase B of docs/adr/0004
// Demo capture (GLOSSARY): the local Chromium, driven by Playwright, for every headless capture – pages of
// the demo build (screenshots, UI fragments) as well as the og image, the brand assets and the
// Playwright configs, which only need the browser. A page of the demo build is opened in a theme,
// proven to show the demo dataset and waited for until it is ready under one rule.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { THEME_KEY } from '../../../src/lib/theme-key.ts';
import { DEMO_MARKER } from './demo-dataset.ts';

// Charts don't animate (isAnimationActive={false}); the settle only covers late layout – responsive
// charts re-measuring after a resize and Leaflet's 0.2 s tile fade-in.
const SETTLE_MS = 600;
const READY_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Headless Chromium/Chrome binary: `CHROME_PATH` wins, else the first installed candidate. */
export function findBrowser({ env, candidates, exists }) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const found = candidates.find((p) => exists(p));
  if (!found) throw new Error('No Chromium or Chrome found. Set CHROME_PATH to a Chromium-based browser binary.');
  return found;
}

/** Known install locations, most specific first: system Chromium/Chrome, then Playwright's cache (newest first). */
function browserCandidates(home = os.homedir()) {
  const pwCache = path.join(home, 'Library', 'Caches', 'ms-playwright');
  const playwright = fs.existsSync(pwCache)
    ? fs.readdirSync(pwCache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
        .map((d) => path.join(pwCache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'))
    : [];
  return [
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...playwright,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
}

/** A locally installed Chromium/Chrome (no extra browser download needed): `CHROME_PATH` or the first candidate; throws if there is none. */
export const localBrowser = (env = process.env) =>
  findBrowser({ env, candidates: browserCandidates(), exists: fs.existsSync });

/** Headless local Chromium (Playwright). Close it when done. */
export const launchBrowser = () => chromium.launch({ executablePath: localBrowser() });

/**
 * Opens `url` of a demo build in a fresh context of `browser`: in `theme` (system colour scheme and
 * the app's stored preference – the app defaults to light), at `viewport` × `scale`, optionally with
 * the clock at `now` (keeps running from there) and a time zone and locale. Fails unless the page
 * answers 200 and shows the demo marker – privacy guard: real data is never captured.
 * @returns {Promise<{ page: import('@playwright/test').Page, errors: string[], close: () => Promise<void> }>}
 *   the page, the page errors seen so far (live), and a close for its context
 */
export async function openDemoPage(browser, url, { theme, viewport, scale = 1, now, timeZone, locale } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: theme, timezoneId: timeZone, locale });
  try {
    await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch {} }, [THEME_KEY, theme]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (now) {
      await page.clock.install({ time: new Date(now) });
      await page.clock.resume(); // Leaflet's tile fade needs a moving clock
    }
    const res = await page.goto(url);
    if (res?.status() !== 200) throw new Error(`${url}: HTTP ${res?.status()}`);
    if (!(await page.locator(`[${DEMO_MARKER}]`).count())) throw new Error(`${url} is not showing the demo data. Captures are only taken in demo mode.`);
    return { page, errors, close: () => context.close() };
  } catch (err) {
    await context.close();
    throw err;
  }
}

/**
 * Runs in the page: fonts, images, every island (`<html data-hydrated>`, src/lib/island-ready.ts) and
 * the map tiles are done, and every displayed chart under `root` is drawn.
 */
function isReady(root) {
  if (document.readyState !== 'complete' || document.fonts.status !== 'loaded') return false;
  if ([...document.images].some((img) => !img.complete)) return false;
  if (Number(document.documentElement.dataset.hydrated ?? 0) < document.querySelectorAll('astro-island').length) return false;
  if (document.querySelector('.leaflet-tile:not(.leaflet-tile-loaded)')) return false;
  if (document.querySelector('.leaflet-container') && !document.querySelector('.leaflet-tile-loaded')) return false;
  const el = document.querySelector(root);
  if (!el) return false;
  // Recharts measures its container first and only then draws the SVG (a hidden one never does)
  return [...el.querySelectorAll('.recharts-responsive-container')]
    .filter((c) => c.getBoundingClientRect().width > 0)
    .every((c) => c.querySelector('svg.recharts-surface'));
}

/** Resolves once the page is ready under `root` (a selector), stays ready over a short settle, and is ready again after it. */
export async function waitUntilReady(page, root = 'body') {
  const t0 = Date.now();
  for (let settled = false; ;) {
    if (await page.evaluate(isReady, root)) {
      if (settled) return;
      await sleep(SETTLE_MS);
      settled = true;
      continue;
    }
    if (Date.now() - t0 > READY_TIMEOUT_MS) throw new Error(`Timed out waiting for ${page.url()} (${root}) to finish loading`);
    await sleep(200);
  }
}

/**
 * The viewport – or the `clip` box (document CSS px) – as WebP, quality 80, at the page's pixel
 * density. Playwright's own screenshots know no WebP.
 */
export async function captureWebp(page, clip) {
  const view = await page.evaluate(() => ({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, scale: devicePixelRatio }));
  const { x, y, width, height } = clip ?? view;
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 80, clip: { x, y, width, height, scale: view.scale } });
    return Buffer.from(data, 'base64');
  } finally { await cdp.detach(); }
}
