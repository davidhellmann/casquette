// Renders the brand PNG pages (scripts/site/lib/brand-assets.mjs) with the local Chromium: serves the
// Damion font, waits for it, places the cap on the "c" with capPlacement() and centres the logo.
import fs from 'node:fs';
import { capPlacement } from '../../../src/lib/brand.js';
import { FONT_FILE, FONT_URL } from './brand-assets.mjs';

const ORIGIN = 'http://brand.local';

/** Loads `html` into a new page of `browser` and returns it with the logo laid out. */
export async function openBrandPage(browser, { html, width, height, scale = 1 }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    return url.pathname === FONT_URL
      ? route.fulfill({ body: fs.readFileSync(FONT_FILE), contentType: 'font/woff2' })
      : route.fulfill({ body: html, contentType: 'text/html' });
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => document.fonts.ready);
  if (!(await page.evaluate(() => document.fonts.check('16px Damion')))) throw new Error('Damion did not load');

  // The placement exactly as on the approval sheet: the "c"'s box measured in the rendered word.
  const words = await page.evaluate(() => [...document.querySelectorAll('.wm')].map((wm) => {
    const fs = parseFloat(getComputedStyle(wm).fontSize), r = wm.getBoundingClientRect(), c = wm.querySelector('.c').getBoundingClientRect();
    return { fs, cTop: (c.top - r.top) / fs, cLeft: (c.left - r.left) / fs };
  }));
  const boxes = words.map(({ fs, cTop, cLeft }) => {
    const p = capPlacement({ cTop, cLeft });
    return { left: p.left * fs, top: p.top * fs, width: p.width * fs, height: p.height * fs, rotate: p.rotate, origin: p.origin };
  });
  await page.evaluate((boxes) => {
    document.querySelectorAll('.wm').forEach((wm, i) => {
      const b = boxes[i], cap = wm.querySelector('.cap');
      Object.assign(cap.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, transform: `rotate(${b.rotate}deg)`, transformOrigin: b.origin });
      wm.parentElement.style.paddingLeft = `${Math.max(0, -b.left)}px`;
    });
    // Centre on the ink: the glyphs (canvas text metrics) and the cap's strokes.
    const ctx = document.createElement('canvas').getContext('2d');
    document.querySelectorAll('[data-centre]').forEach((stage) => {
      const lk = stage.querySelector('.lk'), wm = lk.querySelector('.wm'), fs = parseFloat(getComputedStyle(wm).fontSize);
      ctx.font = `${fs}px Damion`;
      const m = ctx.measureText(wm.textContent), r = wm.getBoundingClientRect(), c = wm.querySelector('.c').getBoundingClientRect();
      const base = c.top + m.fontBoundingBoxAscent;
      let [x1, y1, x2, y2] = [r.left - m.actualBoundingBoxLeft, base - m.actualBoundingBoxAscent, r.left + m.actualBoundingBoxRight, base + m.actualBoundingBoxDescent];
      const cap = wm.querySelector('.cap'), half = (3.12 / 2) * (cap.getBoundingClientRect().width / 48);
      for (const path of cap.querySelectorAll('path')) {
        const p = path.getBoundingClientRect();
        x1 = Math.min(x1, p.left - half); y1 = Math.min(y1, p.top - half); x2 = Math.max(x2, p.right + half); y2 = Math.max(y2, p.bottom + half);
      }
      const s = stage.getBoundingClientRect();
      lk.style.transform = `translate(${s.left + s.width / 2 - (x1 + x2) / 2}px, ${s.top + s.height / 2 - (y1 + y2) / 2}px)`;
      stage.dataset.ink = JSON.stringify([x2 - x1, y2 - y1]);
    });
  }, boxes);
  return page;
}
