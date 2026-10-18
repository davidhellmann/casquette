import { expect, test, type Page } from './fixtures';
import { DETAIL_PAGES, STATIC_PAGES, firstLink } from './pages';

// Every page of the demo build renders without errors in the browser console.
// Failed requests to other origins (map tiles) are ignored – the e2e run may be offline.
function collectErrors(page: Page, baseURL: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const from = msg.location().url;
    if (from && !from.startsWith(baseURL)) return;
    errors.push(msg.text());
  });
  return errors;
}

for (const url of STATIC_PAGES) {
  test(`${url} loads without console errors`, async ({ page, baseURL }) => {
    const errors = collectErrors(page, baseURL!);
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);
    expect(errors).toEqual([]);
  });
}

for (const { name, index, link } of DETAIL_PAGES) {
  test(`a ${name} page loads without console errors`, async ({ page, baseURL }) => {
    await page.goto(index, { waitUntil: 'networkidle' });
    const url = await firstLink(page, link);
    const errors = collectErrors(page, baseURL!);
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200);
    expect(errors).toEqual([]);
  });
}
