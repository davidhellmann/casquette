import { expect, test } from './fixtures';
import { DETAIL_PAGES, STATIC_PAGES, firstLink } from './pages';

// #27: the app is called Casquette everywhere – titles, the sidebar home link, the visible text.
async function expectCasquette(page) {
  await expect(page).toHaveTitle(/Casquette$/);
  const home = page.getByRole('link', { name: 'Casquette – home', exact: true });
  await expect(home).toBeVisible();
  await expect(home.locator('[data-slot="app-logo"]')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/\bSDB\b/);
}

for (const url of STATIC_PAGES) {
  test(`${url} is branded Casquette`, async ({ page }) => {
    await page.goto(url);
    await expectCasquette(page);
  });
}

for (const { name, index, link } of DETAIL_PAGES) {
  test(`a ${name} page is branded Casquette`, async ({ page }) => {
    await page.goto(index);
    await page.goto(await firstLink(page, link));
    await expectCasquette(page);
  });
}

test('the sidebar shows the logo – Damion text with the cap on the "c" – and the cap alone when collapsed', async ({ page }) => {
  await page.goto('/');
  const home = page.getByRole('link', { name: 'Casquette – home', exact: true });
  const logo = home.locator('[data-slot="app-logo"]');
  const mark = home.locator('[data-slot="app-mark"]');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveText('casquette.');
  await expect(logo.locator('svg')).toBeVisible();
  expect(await logo.evaluate((el) => document.fonts.check(`16px ${getComputedStyle(el).fontFamily}`) && getComputedStyle(el).fontFamily)).toMatch(/Damion/);
  await expect(mark).toBeHidden();
  await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
  await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
  await expect(mark).toBeVisible();
  await expect(logo).toBeHidden();
});

test('the favicon and the touch icon are served', async ({ page, request }) => {
  await page.goto('/');
  for (const rel of ['icon', 'apple-touch-icon']) {
    const href = await page.locator(`link[rel="${rel}"]`).getAttribute('href');
    const res = await request.get(href!);
    expect(res.status(), rel).toBe(200);
  }
});
