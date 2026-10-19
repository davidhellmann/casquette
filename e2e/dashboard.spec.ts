import { expect, test, type Page } from './fixtures';

const kpi = (page: Page, label: string) => page.getByTestId('kpis').locator('[data-slot="kpi-card"]').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const kpiValue = (page: Page, label: string) => kpi(page, label).locator('p').first();

test('shows the eight key figures of the period', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('kpis').locator('[data-slot="kpi-card"]')).toHaveCount(8);
  for (const label of ['Rides', 'Moving time', 'Distance', 'Elevation', 'Avg power', 'Avg heart rate', 'Training load', 'PRs'])
    await expect(kpi(page, label)).toBeVisible();
  await expect(page.getByTestId('athlete-line')).toContainText(/FTP \d+ W/);
});

test('switching the period changes the key figures, and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const rides30 = await kpiValue(page, 'Rides').textContent();
  const period = page.getByRole('radiogroup', { name: 'Period' });
  await period.getByRole('radio', { name: 'All time' }).click();
  await expect(kpiValue(page, 'Rides')).not.toHaveText(rides30!);
  const ridesAll = await kpiValue(page, 'Rides').textContent();
  // All time has no previous period to compare with
  await expect(kpi(page, 'Rides').locator('[data-slot="delta"]')).toContainText('–');

  await page.reload();
  await expect(period.getByRole('radio', { name: 'All time' })).toHaveAttribute('aria-checked', 'true');
  await expect(kpiValue(page, 'Rides')).toHaveText(ridesAll!);
});

test('the fitness chart renders and shows the day on hover', async ({ page }) => {
  await page.goto('/');
  const chart = page.getByTestId('fitness-chart');
  await expect(chart.locator('.recharts-area-curve')).toBeVisible();
  const box = (await chart.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await expect(chart.getByText('Fitness (CTL)')).toBeVisible();
  await expect(chart.getByText(/Daily load: /)).toBeVisible();
});

test('charts follow the theme instantly', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const curve = page.getByTestId('fitness-chart').locator('.recharts-area-curve').first();
  const stroke = () => curve.evaluate((el) => getComputedStyle(el).stroke);
  const light = await stroke();
  await page.getByTestId('theme-menu').click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect.poll(stroke).not.toBe(light);
});
