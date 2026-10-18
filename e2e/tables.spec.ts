import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

// Shared table style and the ride-list options: a flat, sortable table or tiles grouped by week/month.
const log = (page: Page) => page.getByRole('table', { name: 'Ride log' });
const tiles = (page: Page) => page.getByTestId('ride-log').getByTestId('table-tiles');
const rideRows = (page: Page) => log(page).locator('tbody tr:not([data-group])');
const groupHeaders = (page: Page) => log(page).locator('tbody th[scope="rowgroup"]');
const grouping = (page: Page) => page.getByRole('radiogroup', { name: 'Group rides' });
const view = (page: Page) => page.getByRole('radiogroup', { name: 'View' });

async function openAllTime(page: Page) {
  await page.goto('/rides/');
  await page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'All time' }).click();
  await expect(rideRows(page)).toHaveCount(25);
}

test('a row takes the panel fill on hover and opens its ride on click', async ({ page }) => {
  await page.goto('/rides/');
  const row = rideRows(page).first();
  await expect(row).toHaveCSS('cursor', 'pointer');
  const rest = await row.evaluate((r) => getComputedStyle(r).backgroundColor);
  await row.hover();
  const panel = await page.locator('[data-slot="sidebar-inset"]').evaluate((e) => getComputedStyle(e).backgroundColor);
  await expect(row).toHaveCSS('background-color', panel);
  expect(rest).not.toBe(panel);
  // No coloured edge, no movement
  await expect(row.locator('td').first()).toHaveCSS('border-left-width', '0px');

  const href = await row.getByRole('link').first().getAttribute('href');
  await row.locator('td').last().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('ride cells are two lines: date over weekday, name over place', async ({ page }) => {
  await page.goto('/rides/');
  const row = rideRows(page).first();
  await expect(row.getByTestId('date-cell').locator('> *')).toHaveCount(2);
  await expect(row.getByTestId('ride-cell').getByTestId('ride-sub')).toHaveText(/\S/);
  // Units small and muted after the value
  const headers = await log(page).locator('thead th').allTextContents();
  const km = row.locator('td').nth(headers.indexOf('Distance'));
  await expect(km).toHaveText(/^\d[\d.,]*\s?km$/);
  await expect(km.getByText('km', { exact: true })).toHaveCSS('font-family', /mono/i);
});

test('the table is flat and sortable – grouping is an option of the tiles view only', async ({ page }) => {
  await openAllTime(page);
  await expect(groupHeaders(page)).toHaveCount(0);
  await expect(grouping(page)).toBeHidden();
  await log(page).locator('thead th').filter({ hasText: /^Distance$/ }).getByRole('button').click();
  await expect(log(page).locator('thead th').filter({ hasText: /^Distance$/ })).toHaveAttribute('aria-sort', /ending/);
  await expect(groupHeaders(page)).toHaveCount(0);
});

test('tiles group by week by default, by month or not at all, always in date order', async ({ page }) => {
  await openAllTime(page);
  // A table sorted by distance – the tiles still come by date
  await log(page).locator('thead th').filter({ hasText: /^Distance$/ }).getByRole('button').click();
  await view(page).getByRole('radio', { name: 'Tiles' }).click();
  const list = tiles(page);
  await expect(grouping(page).getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
  await expect(list.getByTestId('tile-group').first()).toHaveText(/^Week \d{1,2}.*\d[\d,.]* km · \d+(:\d\d h| min)$/);

  await grouping(page).getByRole('radio', { name: 'Month' }).click();
  await expect(list.getByTestId('tile-group').first()).toHaveText(/^[A-Z][a-z]+ \d{4}/);

  await grouping(page).getByRole('radio', { name: 'None' }).click();
  await expect(list.getByTestId('tile-group')).toHaveCount(0);
  await expect(list.getByRole('link')).toHaveCount(25);

  await view(page).getByRole('radio', { name: 'Table' }).click();
  await expect(grouping(page)).toBeHidden();
});

test('the tiles view lists rides as links and is remembered', async ({ page }) => {
  await page.goto('/rides/');
  await expect(rideRows(page).first()).toBeVisible();
  await view(page).getByRole('radio', { name: 'Tiles' }).click();
  await expect(log(page)).toHaveCount(0);
  const list = tiles(page);
  await expect(list.getByRole('link').first()).toHaveAttribute('href', /\/rides\/[^/]+\/?$/);
  // Four key figures with small labels
  await expect(list.getByRole('link').first().locator('dt')).toHaveCount(4);

  // Keyboard focus is visible
  await list.getByRole('link').first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(list.getByRole('link').first()).toBeFocused();
  await expect(list.getByRole('link').first()).not.toHaveCSS('box-shadow', 'none');

  await page.reload();
  await expect(tiles(page).getByRole('link').first()).toBeVisible();
  await expect(view(page).getByRole('radio', { name: 'Tiles' })).toHaveAttribute('aria-checked', 'true');
  await expect(log(page)).toHaveCount(0);

  await view(page).getByRole('radio', { name: 'Table' }).click();
  await expect(rideRows(page).first()).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ride lists always show tiles', async ({ page }) => {
    await page.goto('/rides/');
    await expect(tiles(page).getByRole('link').first()).toBeVisible();
    await expect(log(page)).toBeHidden();
    await expect(view(page)).toBeHidden();
    // Tiles on the phone keep their grouping option
    await expect(grouping(page)).toBeVisible();
    await expect(tiles(page).getByTestId('tile-group').first()).toHaveText(/^Week \d{1,2}/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);

    await page.goto('/');
    await expect(page.getByTestId('recent-rides').getByTestId('table-tiles').getByRole('link').first()).toBeVisible();
  });
});

test('tables without a time axis have no grouping and no tiles', async ({ page }) => {
  await page.goto('/segments/');
  await expect(page.getByRole('table', { name: 'Segments' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: /Group/ })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'View' })).toHaveCount(0);
  // Same header style everywhere: small uppercase mono labels
  await expect(page.getByRole('table', { name: 'Segments' }).locator('thead th').first()).toHaveCSS('text-transform', 'uppercase');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`table and grouped tiles have no serious accessibility violations (${scheme})`, async ({ page }) => {
    // No colour transitions mid-check
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/rides/');
    await expect(rideRows(page).first()).toBeVisible();
    await rideRows(page).first().hover();
    const check = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await check();
    await view(page).getByRole('radio', { name: 'Tiles' }).click();
    await expect(tiles(page).getByTestId('tile-group').first()).toBeVisible();
    await tiles(page).getByRole('link').first().hover();
    await check();
  });
}
