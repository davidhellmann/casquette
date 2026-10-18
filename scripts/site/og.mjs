// The website's social image: website/og.png (1200 × 630) from scripts/site/og/template.html – the real
// dashboard fragment (website/ui/) next to the headline, in the website's dark theme.
// `npm run og`. Run `npm run fragments` first when the app changed.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/capture.mjs';
import { ROOT } from '../shared/env.mjs';
import { serveStatic } from './lib/static-server.mjs';

const TEMPLATE = path.join(ROOT, 'scripts/site/og/template.html');
const OUT = path.join(ROOT, 'website/og.png');

const server = await serveStatic(path.join(ROOT, 'website'));
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  // The template is served from scripts/site/, the website around it unchanged
  await page.route(`${server.url}/__og.html`, (route) => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(TEMPLATE, 'utf8') }));
  await page.goto(`${server.url}/__og.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.ogReady);
  if (errors.length) throw new Error(`og: ${errors.join('; ')}`);
  await page.locator('#og').screenshot({ path: OUT });
  console.log(`wrote ${path.relative(ROOT, OUT)} (1200 × 630)`);
} finally {
  await browser.close();
  await server.close();
}
