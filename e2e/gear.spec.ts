import AxeBuilder from '@axe-core/playwright';
import { DEMO_BIKE_PATHS } from './demo';
import { expect, test, type Page } from './fixtures';

// Demo dataset: four bikes – one retired (Steel Classic), Carbon Endurance is the primary bike.
const BIKES = ['Carbon Endurance', 'Gravel All-Road', 'Indoor Trainer', 'Steel Classic'];
const CHARTS = ['gear-month-chart', 'gear-type-chart', 'gear-year-chart', 'gear-curve-chart'];

async function bikeUrls(page: Page) {
  await page.goto('/gear/');
  return page.getByTestId('bike-card').getByRole('link').evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
}

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('the gear overview shows one card per bike, each linking to its page', async ({ page }) => {
  await page.goto('/gear/');
  await expect(page.getByTestId('gear')).toBeVisible();
  const cards = page.getByTestId('bike-card');
  await expect(cards).toHaveCount(BIKES.length);
  for (const name of BIKES) await expect(cards.getByRole('link', { name, exact: true })).toHaveAttribute('href', /\/gear\/[^/]+\/?$/);
  await expect(cards.filter({ hasText: 'Steel Classic' })).toContainText('Retired');
  await expect(cards.filter({ hasText: 'Carbon Endurance' })).toContainText('Primary');
});

test('the overview draws kilometres per bike and year as rounded bars', async ({ page }) => {
  await page.goto('/gear/');
  const chart = page.getByTestId('gear-bikes-chart');
  await expect(chart.locator('.recharts-surface')).toBeVisible();
  // A rounded top is drawn with arcs
  await expect(chart.locator('.recharts-bar-rectangle path[d*="A"]').first()).toBeAttached();
});

test('every demo bike page renders its charts, records and rides', async ({ page }) => {
  const urls = await bikeUrls(page);
  expect(urls).toHaveLength(BIKES.length);
  for (const url of urls) {
    await page.goto(url);
    await expect(page.getByTestId('gear-detail')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(`^(${BIKES.join('|')})$`));
    for (const id of CHARTS) await expect(page.getByTestId(id).locator('.recharts-surface, [data-slot="empty-state"]').first()).toBeVisible();
    await expect(page.getByTestId('gear-records').locator('a[href*="/rides/"]').first()).toBeVisible();
    await expect(page.getByTestId('gear-rides').locator('tbody tr').first()).toBeVisible();
  }
});

test('a bike page draws distance per year and month as rounded bars and shows cost per km', async ({ page }) => {
  await page.goto('/gear/');
  await page.getByTestId('bike-card').getByRole('link', { name: 'Gravel All-Road', exact: true }).click();
  await expect(page).toHaveURL(/\/gear\/bdemo3\/?$/);
  for (const id of ['gear-month-chart', 'gear-year-chart']) {
    await expect(page.getByTestId(id).locator('.recharts-bar-rectangle path[d*="A"]').first()).toBeAttached();
  }
  await expect(page.getByTestId('gear-kpis')).toContainText('Cost per km');
  await expect(page.getByTestId('gear-kpis')).toContainText('€');
});

test('the power curve on a bike shows watts and W/kg on hover', async ({ page }) => {
  await page.goto('/gear/bdemo2/');
  const chart = page.getByTestId('gear-curve-chart');
  const box = (await chart.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(chart.getByText(/\d W · \d+\.\d\d W\/kg/).first()).toBeVisible();
});

test('e2e/demo.ts knows every bike page of the overview', async ({ page }) => {
  expect((await bikeUrls(page)).map((u) => u.replace(/\/?$/, '/')).sort()).toEqual(DEMO_BIKE_PATHS);
});

// One test per page: axe on every gear page in a single test outgrows the time budget under load
for (const scheme of ['light', 'dark'] as const) {
  for (const url of ['/gear/', ...DEMO_BIKE_PATHS]) {
    test(`${url} has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url, { waitUntil: 'networkidle' });
      await axe(page);
    });
  }
}
