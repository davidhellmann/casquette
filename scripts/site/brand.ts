// Regenerates every brand asset from the brand source (src/lib/brand.ts): favicon and app icons as
// SVG (the cap alone); apple-touch-icon.png, og.png and the README header PNGs rendered with the
// local Chromium from HTML that sets the word in Damion (scripts/site/lib/brand-assets.ts); the website's
// copies of the icons (website/).
// Usage: npm run brand
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_PNGS, WEBSITE_COPIES, brandFiles } from './lib/brand-assets.ts';
import { openBrandPage } from './lib/brand-render.ts';
import { launchBrowser } from './lib/capture.ts';
import { ROOT } from '../shared/env.ts';

for (const [file, content] of Object.entries(brandFiles())) {
  fs.writeFileSync(path.join(ROOT, file), content);
  console.log(`wrote ${file}`);
}

const browser = await launchBrowser();
try {
  for (const [file, spec] of Object.entries(BRAND_PNGS)) {
    const page = await openBrandPage(browser, spec);
    await page.screenshot({ path: path.join(ROOT, file), omitBackground: Boolean(spec.transparent) });
    await page.close();
    console.log(`rendered ${file} (${spec.width * spec.scale} × ${spec.height * spec.scale})`);
  }
} finally {
  await browser.close();
}

for (const [copy, source] of Object.entries(WEBSITE_COPIES)) {
  fs.copyFileSync(path.join(ROOT, source), path.join(ROOT, copy));
  console.log(`copied ${source} → ${copy}`);
}
