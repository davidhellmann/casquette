import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { STYLE_PROPS, diffStyles, snapshotStyles } from '../scripts/site/lib/fragments.mjs';

// Refs #46: the committed UI fragments (website/ui/, `npm run fragments`) render on their own, in light
// and dark, without app JavaScript – and neither leak into a host page nor take styles from it.
// Freshness against the demo build: `npm run fragments -- --check`.
const DIR = path.resolve(import.meta.dirname, '..', 'website', 'ui');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'fragments.json'), 'utf8'));
const fragmentFiles: string[] = manifest.fragments.map((f: { file: string }) => f.file);

/** `/ui/host.html`: a host page built by the test, next to the fragments (relative URLs resolve to website/ui/). */
async function hostPage(page: Page, html: string) {
  await page.unrouteAll();
  await page.route('**/ui/host.html', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('/ui/host.html');
  await page.evaluate(() => document.fonts.ready);
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

test('fragments are static markup: no scripts, no app links, demo data only', () => {
  for (const file of [...fragmentFiles, 'index.html']) {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(html, file).not.toMatch(/<script\b|\son[a-z]+=|\/_astro\/|astro-island|href="\//i);
  }
  for (const f of manifest.fragments) expect(f.source).not.toMatch(/^\/rides\/(?!demo-)/);
  expect(fs.readdirSync(DIR).filter((f) => /\.js$/.test(f))).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`preview renders every fragment in ${theme} with the app fonts`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const errors = watchErrors(page);
    await page.goto('/ui/index.html');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Casquette UI Geist"') && document.fonts.check('16px "Casquette UI Geist Mono"'))).toBe(true);
    for (const f of manifest.fragments) {
      const el = page.locator(`[data-fragment="${f.name}"]`);
      await expect(el).toHaveAttribute('inert', '');
      const box = await el.locator(':scope > *').boundingBox();
      expect(Math.ceil(box!.width), f.name).toBe(f.width);
      expect(Math.ceil(box!.height), f.name).toBe(f.height);
      if (fs.readFileSync(path.join(DIR, f.file), 'utf8').includes('recharts-surface')) await expect(el.locator('svg.recharts-surface').first()).toBeVisible();
    }
    await expect(page.locator('picture img')).toHaveJSProperty('complete', true);
    const panel = await page.locator('[data-fragment="dashboard"]').evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim());
    expect(panel).toBe(theme === 'dark' ? '#131b2e' : '#f7f8f9');
    expect(errors).toEqual([]);
  });
}

test('a .dark / .light class on an ancestor overrides the system preference', async ({ page }) => {
  const fragment = fs.readFileSync(path.join(DIR, 'load.html'), 'utf8');
  const card = async (theme: 'dark' | 'light', system: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: system });
    await hostPage(page, `<!doctype html><link rel="stylesheet" href="ui.css"><div class="${theme}">${fragment}</div>`);
    return page.locator('[data-fragment] [data-slot=kpi-card]').evaluate((el) => getComputedStyle(el).backgroundColor);
  };
  expect(await card('dark', 'light')).toBe('rgb(26, 35, 56)'); // --card, dark
  expect(await card('light', 'dark')).toBe('rgb(236, 238, 241)'); // --card, light
});

test('fragment styles stay inside, host styles stay outside', async ({ page }) => {
  const fragments = fragmentFiles.map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('');
  // Typical site base styles: bare elements, the universal selector, single classes and attributes
  const hostileCss = `<style>
    * { box-sizing: content-box; letter-spacing: .1em }
    html { font-size: 22px } body { font: 700 20px/2 Georgia, serif; color: red; text-transform: uppercase; text-align: center }
    h1, h2, h3, p { margin: 1em 0; font-size: 2rem; font-weight: 900 } ul, ol { padding-left: 3em; list-style: disc }
    button { padding: 1em; border: 3px solid red; background: yellow } div { line-height: 3 } span { font-style: italic }
    [data-slot] { outline: 4px solid red } svg { max-width: 50%; height: auto }
  </style>`;
  const host = (css: string) => `<!doctype html><html><head><link rel="stylesheet" href="ui.css">${css}</head>
    <body><h1 id="host-title">Host page</h1><p id="host-text">Host text</p><button id="host-button">Host</button>${fragments}</body></html>`;
  // No colour transitions while ui.css arrives after the host's own styles
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const snap = () => page.evaluate(`[...document.querySelectorAll('[data-fragment] > *')].map((el) => (${snapshotStyles})(el, ${JSON.stringify(STYLE_PROPS)}))`) as Promise<string[][][]>;
  await hostPage(page, host(''));
  const clean = await snap();
  const hostStyles = () => page.evaluate(() => ['host-title', 'host-text', 'host-button'].map((id) => {
    const cs = getComputedStyle(document.getElementById(id)!);
    return [cs.fontFamily, cs.fontSize, cs.margin, cs.padding, cs.boxSizing, cs.color, cs.backgroundColor, cs.borderTopWidth].join(' ');
  }));

  // Nothing of ui.css reaches the host's own elements
  const withUi = await hostStyles();
  await page.evaluate(() => document.querySelector('link[href="ui.css"]')!.remove());
  expect(await hostStyles()).toEqual(withUi);

  // …and nothing of the host's base styles reaches the fragments
  await hostPage(page, host(hostileCss));
  const hostile = await snap();
  clean.forEach((fragment, i) => expect(diffStyles(fragment, hostile[i]), fragmentFiles[i]).toEqual([]));
});

test('the preview has no accessibility violations (fragments are inert)', async ({ page }) => {
  await page.goto('/ui/index.html');
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
