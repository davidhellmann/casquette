#!/usr/bin/env node
// Refs #14, #41: product screenshots (README, website) from the demo dataset.
//
//   npm run build && npm run preview      # terminal 1 (demo mode: no real rides present)
//   npm run screenshots                   # terminal 2 → docs/screenshots/*.webp
//
// Options: --url <preview URL> (default http://localhost:4321), --only <shot name>.
// Browser: any Chromium/Chrome; set CHROME_PATH if it isn't found automatically (./lib/capture.mjs).
// The demo indicator in the sidebar is hidden by CSS injected here, so the app itself needs no
// screenshot mode.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { captureWebp, launchBrowser, openDemoPage, waitUntilReady } from './lib/capture.mjs';
import { DEMO_MARKER, heroRide, readDemoDataset, reviewYear } from './lib/demo-dataset.mjs';
import { ROOT } from './lib/env.mjs';
import { SHOTS, VIEWPORT, planShots } from './lib/screenshots.mjs';

const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');
// Marketing framing only: hide the demo indicator (its whole sidebar menu item, so no gap is left).
const SHOT_CSS = `[data-sidebar=menu-item]:has([${DEMO_MARKER}]){display:none!important}`;

const { values: args } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:4321' }, only: { type: 'string' } } });

async function capture(browser, shot) {
  const { width, height, deviceScaleFactor } = VIEWPORT;
  const { page, close } = await openDemoPage(browser, shot.url, { theme: shot.theme, viewport: { width, height }, scale: deviceScaleFactor });
  try {
    await page.addStyleTag({ content: SHOT_CSS });
    await waitUntilReady(page);
    if (shot.focus) {
      // After hydration: the island renders the focused element, and the layout above it is final
      const found = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        // Start right below the element before it, so its gap stays visible but none of its edge
        const prev = el.previousElementSibling;
        window.scrollTo(0, Math.ceil((prev ?? el).getBoundingClientRect()[prev ? 'bottom' : 'top'] + scrollY));
        return true;
      }, shot.focus);
      if (!found) throw new Error(`${shot.focus} not found on ${shot.url}`);
      await waitUntilReady(page); // charts scrolled into view, Leaflet's late tiles
    }
    return await captureWebp(page);
  } finally { await close(); }
}

async function main() {
  const base = args.url.replace(/\/$/, '');
  try { await fetch(base); } catch { throw new Error(`No preview server at ${base}. Run \`npm run build && npm run preview\` first.`); }

  const shots = SHOTS.filter((s) => !args.only || s.name === args.only);
  if (!shots.length) throw new Error(`Unknown shot "${args.only}". Shots: ${SHOTS.map((s) => s.name).join(', ')}`);
  // The preview shows the demo dates moved up to today: pick the ride and year from the same dates
  const { rides } = readDemoDataset({ today: new Date() });
  const plan = planShots({ baseUrl: base, ride: heroRide(rides), year: reviewYear(rides), shots });

  const browser = await launchBrowser();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    for (const shot of plan) {
      const image = await capture(browser, shot);
      fs.writeFileSync(path.join(OUT_DIR, shot.file), image);
      console.log(`${shot.file.padEnd(22)} ${(image.length / 1024).toFixed(0).padStart(5)} KB  ${shot.url}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
