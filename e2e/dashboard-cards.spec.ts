import { expect, test, type Page } from './fixtures';

// Every card below the fitness chart and the training calendar (#32). Charts are Recharts or
// owned SVG components; list cards (goals, records, nutrition …) show their rows.
const CHART_CARDS = [
  'form-card', 'polarization-card', 'profile-card', 'load-card', 'zone-weeks-chart', 'zone-share-chart',
  'time-in-zones', 'rhythm-card', 'power-hr-chart', 'efficiency-chart', 'period-curve-chart', 'ride-analysis',
  'years-chart', 'cumulative-chart', 'zones-card',
];
const LIST_CARDS = ['goals', 'all-time-card', 'records', 'nutrition-card', 'fuel-matrix', 'garage-card'];
const CHART = '.recharts-surface, svg[data-slot="chart-svg"], [data-slot="empty-state"]';

const card = (page: Page, id: string) => page.getByTestId(id);

/** Load the dashboard with only the rides older than two years in its build payload. */
async function withOnlyOldRides(page: Page) {
  await page.route('**/', async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace(/(<script type="application\/json" id="dash-data">)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
      const data = JSON.parse(json);
      const cut = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10);
      data.rides = data.rides.filter((r: { start_local: string }) => r.start_local.slice(0, 10) < cut);
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html' } });
  });
}

test('the dashboard has no Chart.js canvas left', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('every dashboard card renders a chart or its empty state', async ({ page }) => {
  await page.goto('/');
  for (const id of CHART_CARDS) await expect(card(page, id).locator(CHART).first(), id).toBeVisible();
  for (const id of LIST_CARDS) await expect(card(page, id), id).toBeVisible();
  await expect(card(page, 'goals').locator('[data-slot="goal"]').first()).toBeVisible();
  await expect(card(page, 'records').locator('a[href*="/rides/"]').first()).toBeVisible();
  await expect(card(page, 'garage-card').getByText(/\d km/).first()).toBeVisible();
});

test('cards of a period without rides show their empty states', async ({ page }) => {
  await withOnlyOldRides(page);
  await page.goto('/');
  await expect(page.getByTestId('dashboard')).toBeVisible();
  for (const id of ['polarization-card', 'profile-card', 'zone-weeks-chart', 'zone-share-chart', 'time-in-zones',
    'rhythm-card', 'power-hr-chart', 'efficiency-chart', 'ride-analysis', 'records'])
    await expect(card(page, id).locator('[data-slot="empty-state"]').first(), id).toBeVisible();
  // Independent of the period: still drawn (the power curve keeps its all-time comparison)
  await expect(card(page, 'period-curve-chart').locator('.recharts-surface')).toBeVisible();
  await expect(card(page, 'form-card').locator('svg[data-slot="chart-svg"]')).toBeVisible();
  await expect(card(page, 'years-chart').locator('.recharts-surface')).toBeVisible();
});

test('form gauge, 80/20 ring and zone bars are owned SVGs with their values as text', async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'form-card')).toContainText(/Fitness\s*\d+/);
  await expect(card(page, 'polarization-card').getByText(/^\d+ ?%$/).first()).toBeVisible();
  const bars = card(page, 'time-in-zones').locator('[data-slot="zone-bar"]');
  await expect(bars).toHaveCount(7);
  await card(page, 'time-in-zones').getByRole('radio', { name: 'HR' }).click();
  await expect(bars).toHaveCount(5);
});

test('coaching hints are quiet inline notes', async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'load-card').locator('[data-slot="hint"]')).toBeVisible();
  await expect(card(page, 'polarization-card').locator('[data-slot="hint"]')).toBeVisible();
});

test('the ride analysis browses the rides of the period', async ({ page }) => {
  await page.goto('/');
  const deep = card(page, 'ride-analysis');
  const title = deep.getByRole('heading', { level: 3 }).nth(1);
  const first = await title.textContent();
  await expect(deep.getByText(/^1 \/ \d+$/)).toBeVisible();
  await deep.getByRole('button', { name: 'Older ride' }).click();
  await expect(deep.getByText(/^2 \/ \d+$/)).toBeVisible();
  await deep.getByRole('button', { name: 'Newer ride' }).click();
  await expect(title).toHaveText(first!);
  await expect(deep.getByRole('link', { name: /All details/ })).toHaveAttribute('href', /\/rides\//);
});

test('switching the zone basis relabels the intensity cards', async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'zone-share-chart')).toContainText('7 power zones');
  await page.getByRole('radiogroup', { name: 'Zones by' }).getByRole('radio', { name: 'HR' }).click();
  await expect(card(page, 'zone-share-chart')).toContainText('5 HR zones');
});

test('a card that follows the zone basis switches it for the whole page', async ({ page }) => {
  await page.goto('/');
  await card(page, 'zone-share-chart').getByRole('radiogroup', { name: /whole page/ }).getByRole('radio', { name: 'HR' }).click();
  await expect(card(page, 'zone-share-chart')).toContainText('5 HR zones');
  await expect(page.getByRole('radiogroup', { name: 'Zones by' }).getByRole('radio', { name: 'HR' })).toHaveAttribute('aria-checked', 'true');
  await expect(card(page, 'efficiency-chart').getByRole('radio', { name: 'HR' })).toHaveAttribute('aria-checked', 'true');
});

test('the power curve shows watts and W/kg on hover', async ({ page }) => {
  await page.goto('/');
  const chart = card(page, 'period-curve-chart');
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(chart.getByText(/\d W · \d+\.\d\d W\/kg/).first()).toBeVisible();
});

test('the dashboard ends with the collection and sync footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('dashboard-footer')).toContainText(/rides in the content collection/);
});

test('the efficiency chart names its y-axis and opens a ride from the keyboard', async ({ page }) => {
  await page.goto('/');
  const ef = card(page, 'efficiency-chart');
  await expect(ef.locator('.recharts-label')).toHaveText('NP per heartbeat');
  // Tab onto the chart, arrow keys move from ride to ride, Enter opens the ride under the tooltip
  const surface = ef.locator('.recharts-surface');
  await surface.focus();
  await expect(surface).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(ef.locator('[data-slot="chart-tooltip"], .recharts-tooltip-wrapper').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
});
