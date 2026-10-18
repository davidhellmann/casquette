#!/usr/bin/env node
// Refs #14, #41: product screenshots (README, website) from the demo dataset.
//
//   npm run build && npm run preview      # terminal 1 (demo mode: no real rides present)
//   npm run screenshots                   # terminal 2 → docs/screenshots/*.webp
//
// Options: --url <preview URL> (default http://localhost:4321), --only <shot name>.
// Browser: any Chromium/Chrome; set CHROME_PATH if it isn't found automatically.
// Zero dependencies: drives headless Chromium over the DevTools protocol (Node's
// built-in WebSocket). The demo indicator in the sidebar is hidden by CSS injected
// here, so the app itself needs no screenshot mode.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SHOTS, VIEWPORT, pickHeroRide, planShots, readDemoRides, reviewYear, rideYears } from './lib/screenshots.mjs';
import { localBrowser } from './lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');
const BADGE = '[data-demo-note]';
// Marketing framing only: hide the demo indicator (its whole sidebar menu item, so no gap is left).
const SHOT_CSS = `[data-sidebar=menu-item]:has(${BADGE}){display:none!important}`;
// Charts don't animate (isAnimationActive={false}); this only covers late layout – responsive charts
// re-measuring after a resize and Leaflet's 0.2 s tile fade-in.
const SETTLE_MS = 600;
const READY_TIMEOUT_MS = 30000;

const { values: args } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:4321' }, only: { type: 'string' } } });

/** Launch headless Chromium and resolve its DevTools WebSocket URL. */
function launchBrowser(bin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'casquette-shots-'));
  const proc = spawn(bin, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--use-mock-keychain', '--password-store=basic', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise((resolve) => proc.on('exit', resolve));
  const close = async () => {
    proc.kill();
    await exited;
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return new Promise((resolve, reject) => {
    let log = '';
    proc.stderr.on('data', (chunk) => {
      log += chunk;
      const m = log.match(/DevTools listening on (ws:\S+)/);
      if (m) resolve({ wsUrl: m[1], close });
    });
    proc.on('exit', (code) => reject(new Error(`Browser exited (${code}):\n${log}`)));
  });
}

/** Minimal DevTools protocol client with flattened target sessions. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`)); else resolve(msg.result);
    } else if (msg.method) listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const once = (method, sessionId) => new Promise((resolve) => {
    const fn = (msg) => { if (msg.method === method && msg.sessionId === sessionId) { listeners.delete(fn); resolve(msg.params); } };
    listeners.add(fn);
  });
  return { send, once, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True once fonts, images, React islands, map tiles and the charts in view are done. */
const READY_CHECK = `(() => {
  if (document.readyState !== 'complete' || document.fonts.status !== 'loaded') return false;
  if ([...document.images].some((img) => !img.complete)) return false;
  if (document.querySelector('astro-island[ssr]')) return false; // Astro drops [ssr] once an island is hydrated
  if (document.querySelector('.leaflet-tile:not(.leaflet-tile-loaded)')) return false;
  if (document.querySelector('.leaflet-container') && !document.querySelector('.leaflet-tile-loaded')) return false;
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
  // Recharts measures its container first and only then draws the SVG
  return [...document.querySelectorAll('.recharts-responsive-container')].filter(inView).every((c) => c.querySelector('svg.recharts-surface'));
})()`;

async function capture(cdp, sessionId, shot) {
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.theme }] }, sessionId);
  // The app defaults to light: pick the shot's theme explicitly
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('rc_theme', ${JSON.stringify(shot.theme)}); } catch (e) {}` }, sessionId);
  const loaded = cdp.once('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url: shot.url }, sessionId);
  await loaded;

  // Privacy guard: the badge only renders in demo mode – never shoot real data.
  if (!(await evaluate(`!!document.querySelector('${BADGE}')`))) {
    throw new Error(`${shot.url} is not showing the demo data. Screenshots are only taken in demo mode.`);
  }
  await evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>${SHOT_CSS}</style>')`);

  const waitReady = async () => {
    const t0 = Date.now();
    while (!(await evaluate(READY_CHECK))) {
      if (Date.now() - t0 > READY_TIMEOUT_MS) throw new Error(`Timed out waiting for ${shot.url} to finish loading`);
      await sleep(250);
    }
  };
  await waitReady();
  if (shot.focus) {
    // After hydration: the island renders the focused element, and the layout above it is final
    const found = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(shot.focus)});
      if (!el) return false;
      // Start right below the element before it, so its gap stays visible but none of its edge
      const prev = el.previousElementSibling;
      window.scrollTo(0, Math.ceil((prev ?? el).getBoundingClientRect()[prev ? 'bottom' : 'top'] + scrollY));
      return true;
    })()`);
    if (!found) throw new Error(`${shot.focus} not found on ${shot.url}`);
    await waitReady(); // charts scrolled into view
  }
  await sleep(SETTLE_MS);
  await waitReady(); // Leaflet may request more tiles after the settle (fitBounds)

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 80 }, sessionId);
  return Buffer.from(data, 'base64');
}

async function main() {
  const base = args.url.replace(/\/$/, '');
  try { await fetch(base); } catch { throw new Error(`No preview server at ${base}. Run \`npm run build && npm run preview\` first.`); }

  const shots = SHOTS.filter((s) => !args.only || s.name === args.only);
  if (!shots.length) throw new Error(`Unknown shot "${args.only}". Shots: ${SHOTS.map((s) => s.name).join(', ')}`);
  const rides = readDemoRides(path.join(ROOT, 'demo', 'rides'));
  const plan = planShots({ baseUrl: base, ride: pickHeroRide(rides), year: reviewYear(rideYears(rides)), shots });

  const browser = await launchBrowser(localBrowser());
  const cdp = await connect(browser.wsUrl);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    for (const shot of plan) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false }, sessionId);
      const image = await capture(cdp, sessionId, shot);
      fs.writeFileSync(path.join(OUT_DIR, shot.file), image);
      console.log(`${shot.file.padEnd(22)} ${(image.length / 1024).toFixed(0).padStart(5)} KB  ${shot.url}`);
      await cdp.send('Target.closeTarget', { targetId });
    }
  } finally {
    cdp.close();
    await browser.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
