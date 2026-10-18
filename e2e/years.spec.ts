import AxeBuilder from '@axe-core/playwright';
import { DEMO_YEARS } from './demo';
import { expect, hydrated, test, type Page } from './fixtures';

/** The years of the demo build, newest first – read from the year cards of /years/. */
async function demoYears(page: Page) {
  await page.goto('/years/');
  const cards = page.getByTestId('year-cards').getByRole('link');
  await expect(cards.first()).toBeVisible();
  const years = (await cards.allTextContents()).map((s) => +s.match(/\d{4}/)![0]);
  expect(years.length).toBeGreaterThan(1);
  return years;
}

const yearSwitch = (page: Page) => page.getByTestId('year-control');

test('the years overview compares every year and links each one', async ({ page }) => {
  const years = await demoYears(page);
  expect(years).toEqual([...years].sort((a, b) => b - a));
  expect(years, 'e2e/demo.ts reads the same years from the demo data').toEqual(DEMO_YEARS);
  await expect(page.getByTestId('years-chart').locator('.recharts-surface')).toBeVisible();
  // Each year card: total kilometres and the months as bars
  const card = page.getByTestId('year-cards').getByRole('link').first();
  await expect(card).toHaveAttribute('href', new RegExp(`/years/${years[0]}/?$`));
  await expect(card).toContainText(/\d km/);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/years/${years[0]}/?$`));
});

test('every demo year renders its review', async ({ page }) => {
  const years = await demoYears(page);
  for (const y of years) {
    await page.goto(`/years/${y}/`);
    await expect(page.getByRole('heading', { level: 1, name: String(y) })).toBeVisible();
    await expect(page.getByTestId('year-kpis').locator('[data-slot="kpi-card"]')).toHaveCount(10);
    await expect(page.getByTestId('months-chart').locator('.recharts-surface')).toBeVisible();
    // Calendar: every day of the year, up to today
    const days = page.getByRole('grid', { name: `Calendar ${y}` }).getByRole('gridcell');
    // Local midnight of today: with the time of day, rounding the day count fails in the afternoon.
    const now = new Date();
    const end = Math.min(+new Date(y, 11, 31), +new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    await expect(days).toHaveCount(Math.round((end - +new Date(y, 0, 1)) / 86400000) + 1);
    await expect(page.getByRole('table', { name: 'Months in detail' }).locator('tbody tr')).toHaveCount(12);
    for (const id of ['intensity-chart', 'power-curve-chart'])
      await expect(page.getByTestId(id).locator('.recharts-surface, [data-slot="empty-state"]').first()).toBeVisible();
    await expect(page.getByTestId('highlights').getByRole('listitem')).toHaveCount(8);
    const top = page.getByRole('table', { name: 'Top 10' }).locator('tbody tr');
    expect(await top.count()).toBeGreaterThan(0);
    expect(await top.count()).toBeLessThanOrEqual(10);
    await expect(page.getByRole('table', { name: 'All rides' })).toBeVisible();
  }
});

test('the top 10 are the longest rides of the year, longest first', async ({ page }) => {
  const [y] = await demoYears(page);
  await page.goto(`/years/${y}/`);
  const km = await page.getByRole('table', { name: 'Top 10' }).locator('tbody tr td:nth-child(3)').allTextContents();
  const values = km.map((s) => +s.replace(/[^\d.]/g, ''));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await page.getByRole('table', { name: 'Top 10' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
});

test('the year switch in the page header moves between the years', async ({ page }) => {
  const years = await demoYears(page);
  const [newest, older] = years;
  await page.goto(`/years/${newest}/`);
  const header = page.locator('[data-slot="page-header"]');
  await expect(header.getByTestId('year-control')).toBeVisible();
  // Newest year: nothing newer
  await expect(yearSwitch(page).getByRole('button', { name: 'Newer year' })).toBeDisabled();
  await yearSwitch(page).getByRole('link', { name: `Older year (${older})` }).click();
  await expect(page).toHaveURL(new RegExp(`/years/${older}/?$`));
  await yearSwitch(page).getByRole('link', { name: `Newer year (${newest})` }).click();
  await expect(page).toHaveURL(new RegExp(`/years/${newest}/?$`));
  // Jump to any year with the picker
  const oldest = years.at(-1)!;
  await hydrated(page); // reached by a link: the picker only opens once the header island has hydrated
  await yearSwitch(page).getByRole('combobox', { name: 'Year' }).click();
  await page.getByRole('option', { name: String(oldest) }).click();
  await expect(page).toHaveURL(new RegExp(`/years/${oldest}/?$`));
  await expect(yearSwitch(page).getByRole('combobox', { name: 'Year' })).toHaveText(String(oldest));
  await expect(yearSwitch(page).getByRole('button', { name: 'Older year' })).toBeDisabled();
});

test('a day in the calendar shows its kilometres and opens its ride', async ({ page }) => {
  const [, y] = await demoYears(page);
  await page.goto(`/years/${y}/`);
  const ride = page.getByRole('grid', { name: `Calendar ${y}` }).getByRole('link').first();
  await ride.hover();
  await expect(page.getByRole('tooltip')).toContainText(/\d+ rides? · [\d.]+ km/);
  await ride.click();
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
});

test('months are rounded bars, the comparison lines smooth', async ({ page }) => {
  const [, y] = await demoYears(page);
  await page.goto(`/years/${y}/`);
  const chart = page.getByTestId('months-chart');
  await expect(chart.locator('.recharts-bar-rectangle path').first()).toHaveAttribute('d', /A/);
  expect(await chart.locator('.recharts-line-curve').first().getAttribute('d')).toMatch(/C/);
  const box = (await chart.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(chart.getByText(/\d+(\.\d)? h/).first()).toBeVisible();
});

// One test per page: axe on every year review in a single test outgrows the time budget under load
for (const scheme of ['light', 'dark'] as const) {
  for (const url of ['/years/', ...DEMO_YEARS.map((y) => `/years/${y}/`)]) {
    test(`${url} has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
