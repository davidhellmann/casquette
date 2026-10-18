import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { buildSite } from '../scripts/lib/site-build.mjs';
import { serveStatic } from '../scripts/lib/static-server.mjs';

// Refs #55: the legal pages as the deploy publishes them – `npm run site:build` with placeholder
// values into temp folders (with and without Cabin), each served on a free port of its own. The raw
// website/ (the other specs) keeps the templates; their placeholders stay readable there.

const SRC = path.resolve(import.meta.dirname, '..', 'website');
const CABIN = 'cabin.example.com';
const ENV = {
  SITE_LEGAL_NAME: 'Jane Rider',
  SITE_LEGAL_ADDRESS: 'Example Street 1|1234 Sample Town',
  SITE_LEGAL_COUNTRY: 'Austria',
  SITE_LEGAL_EMAIL: 'jane@example.com',
};
const PAGES = [
  { file: 'legal-notice.html', title: 'Legal notice' },
  { file: 'privacy-policy.html', title: 'Privacy policy' },
] as const;

type Site = { url: string; close: () => Promise<void> };
let tmp: string;
let withCabin: Site;
let withoutCabin: Site;

test.beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casquette-site-'));
  buildSite({ src: SRC, out: path.join(tmp, 'cabin'), env: { ...ENV, SITE_CABIN_HOST: CABIN } });
  buildSite({ src: SRC, out: path.join(tmp, 'plain'), env: ENV });
  [withCabin, withoutCabin] = await Promise.all([serveStatic(path.join(tmp, 'cabin')), serveStatic(path.join(tmp, 'plain'))]);
});

test.afterAll(async () => {
  await Promise.all([withCabin?.close(), withoutCabin?.close()]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * Answers the Cabin script with an empty one and collects problems: console and page errors,
 * failed responses, and every request that leaves the site except the Cabin host.
 */
async function watch(page: Page, site: Site) {
  const problems: string[] = [];
  const cabin: string[] = [];
  await page.route(`https://${CABIN}/**`, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.host === CABIN) cabin.push(url.pathname);
    else if (url.origin !== site.url) problems.push(`off-site: ${r.url()}`);
  });
  return { problems, cabin };
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    // Served on origins of their own (not seeded by the config): pick the theme explicitly
    test.beforeEach(async ({ page }) => { await page.addInitScript((t) => localStorage.setItem('rc_site_theme', t), scheme); });

    for (const { file, title } of PAGES) {
      test(`${title}: renders filled, no placeholders, accessible, nothing off-site but Cabin`, async ({ page }) => {
        const { problems, cabin } = await watch(page, withCabin);
        await page.goto(`${withCabin.url}/${file}`, { waitUntil: 'networkidle' });
        await expect(page).toHaveTitle(`${title} · Casquette`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        expect(await page.content()).not.toContain('{{');
        // The placeholder values, escaped and in place
        const address = page.locator('address');
        await expect(address).toHaveText(/^\s*Jane Rider\s+Example Street 1\s+1234 Sample Town\s+Austria\s+Email: jane@example\.com\s*$/);
        await expect(address.getByRole('link', { name: 'jane@example.com' })).toHaveAttribute('href', 'mailto:jane@example.com');
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        expect(cabin).toEqual(['/hello.js']);
        expect(problems).toEqual([]);
      });
    }
  });
}

test('footer links work: home → legal notice → privacy policy → home', async ({ page }) => {
  const { problems } = await watch(page, withCabin);
  await page.goto(`${withCabin.url}/`);
  const foot = page.locator('footer');
  await foot.getByRole('link', { name: 'Legal notice' }).click();
  await expect(page).toHaveURL(`${withCabin.url}/legal-notice.html`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal notice');
  await expect(foot.getByRole('link', { name: 'Legal notice' })).toHaveAttribute('aria-current', 'page');
  await foot.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(`${withCabin.url}/privacy-policy.html`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
  await foot.getByRole('link', { name: 'Casquette – home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Training dashboard for your rides.');
  // From the legal notice's text to the privacy policy, and Get started back to the site
  await page.goto(`${withCabin.url}/legal-notice.html`);
  await page.locator('main').getByRole('link', { name: 'privacy policy' }).click();
  await expect(page).toHaveURL(`${withCabin.url}/privacy-policy.html`);
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(`${withCabin.url}/#get`);
  expect(problems).toEqual([]);
});

test('Cabin: the script on every page with SITE_CABIN_HOST, its section and events in the policy', async ({ page, context }) => {
  const script = `script[src="https://${CABIN}/hello.js"]`;
  for (const file of ['', 'legal-notice.html', 'privacy-policy.html']) {
    const tab = await context.newPage();
    const { problems, cabin } = await watch(tab, withCabin);
    await tab.goto(`${withCabin.url}/${file}`, { waitUntil: 'networkidle' });
    await expect(tab.locator(script), file || 'index').toHaveCount(1);
    expect(cabin, file || 'index').toContain('/hello.js');
    expect(problems, file || 'index').toEqual([]);
    await tab.close();
  }
  await page.goto(`${withCabin.url}/privacy-policy.html`);
  await expect(page.getByRole('heading', { level: 2, name: 'Cabin Analytics' })).toBeVisible();
  await expect(page.locator('main')).toContainText(`The script is loaded from ${CABIN}.`);
  // The events the policy lists are the ones the website sends
  const listed = await page.locator('li[data-event]').allTextContents();
  await page.goto(`${withCabin.url}/`);
  const sent = await page.locator('[data-cabin-event]').evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-cabin-event')))]);
  expect(sent.sort()).toEqual(listed.sort());
});

test('without SITE_CABIN_HOST: no script, no Cabin section, no request leaves the site', async ({ page, context }) => {
  for (const file of ['', 'legal-notice.html', 'privacy-policy.html']) {
    const tab = await context.newPage();
    const { problems, cabin } = await watch(tab, withoutCabin);
    await tab.goto(`${withoutCabin.url}/${file}`, { waitUntil: 'networkidle' });
    await expect(tab.locator('script[src*="hello.js"]'), file || 'index').toHaveCount(0);
    expect(cabin).toEqual([]);
    expect(problems, file || 'index').toEqual([]);
    await tab.close();
  }
  await page.goto(`${withoutCabin.url}/privacy-policy.html`);
  await expect(page.locator('main')).not.toContainText(/cabin/i);
  await expect(page.getByRole('heading', { level: 2 })).toContainText(['Data controller', 'Hosting and server logs', 'The live demo', 'Your rights']);
});

test('raw website/: the templates render and show their placeholders as such', async ({ page }) => {
  for (const { file, title } of PAGES) {
    await page.goto(`/${file}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('address')).toContainText('{{SITE_LEGAL_NAME}}');
    await expect(page.locator('address')).toContainText('{{SITE_LEGAL_EMAIL}}');
    await expect(page.locator('script[src*="hello.js"]')).toHaveCount(0);
  }
});
