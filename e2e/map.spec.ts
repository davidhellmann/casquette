import { expect, test, type Page } from './fixtures';

// Demo dataset: 226 rides, 52 of them indoor (31 virtual, 21 on the trainer) → 174 outdoor routes; 49 gravel rides.
const count = (page: Page) => page.getByTestId('route-count');
const panel = (page: Page) => page.getByTestId('places-panel');

async function pick(page: Page, filter: string, option: string) {
  await page.getByRole('combobox', { name: filter, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('the map loads with every outdoor route', async ({ page }) => {
  await page.goto('/map/');
  const map = page.getByTestId('route-map');
  await expect(map.locator('.leaflet-container')).toBeVisible();
  await expect(map.locator('canvas')).toBeVisible();
  await expect(count(page)).toHaveText(/^174 routes · [\d,]+ km$/);
  // The map takes the full panel width next to the places panel
  const box = (await map.boundingBox())!;
  expect(box.width).toBeGreaterThan(700);
  expect(box.height).toBeGreaterThan(500);
});

test('the filters in the toolbar change the shown routes', async ({ page }) => {
  await page.goto('/map/');
  await expect(count(page)).toHaveText(/^174 routes/);
  await pick(page, 'Type', 'Gravel');
  await expect(count(page)).toHaveText(/^49 routes/);
  await pick(page, 'Year', '2024');
  const gravel2024 = Number((await count(page).textContent())!.match(/^(\d+)/)![1]);
  expect(gravel2024).toBeGreaterThan(0);
  expect(gravel2024).toBeLessThan(49);
  await pick(page, 'Year', 'All years');
  await pick(page, 'Type', 'All types');
  await expect(count(page)).toHaveText(/^174 routes/);
  await pick(page, 'Bike', 'Gravel All-Road');
  await expect(count(page)).not.toHaveText(/^174 routes/);
});

test('the places browser drills from country to region to a place and lists its rides', async ({ page }) => {
  await page.goto('/map/');
  await panel(page).getByRole('button', { name: /^Canada/ }).click();
  await expect(page).toHaveURL(/[?&]country=CA/);
  await panel(page).getByRole('button', { name: /^British Columbia/ }).click();
  await expect(page).toHaveURL(/[?&]region=British/);
  await panel(page).getByRole('button', { name: /^Vancouver/ }).click();
  await expect(page).toHaveURL(/[?&]place=Vancouver/);
  await expect(count(page)).not.toHaveText(/^174 routes/);
  const rides = panel(page).getByRole('tabpanel').getByRole('link');
  await expect(rides.first()).toBeVisible();
  const n = Number((await count(page).textContent())!.match(/^(\d+)/)![1]);
  await expect(panel(page).getByRole('tab', { name: `Rides · ${n}` })).toHaveAttribute('aria-selected', 'true');

  // The selection is part of the URL: a reload opens the same place
  await page.reload();
  await expect(count(page)).toHaveText(new RegExp(`^${n} route`));
  await rides.first().click();
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
});

test('searching for a place narrows the place list', async ({ page }) => {
  await page.goto('/map/?country=GB');
  await panel(page).getByRole('searchbox', { name: 'Search place …' }).fill('zzzz');
  await expect(panel(page).getByText('No place found.')).toBeVisible();
});

test('a click on the map lists the rides that pass through that spot', async ({ page }) => {
  await page.goto('/map/');
  await expect(count(page)).toHaveText(/^174 routes/);
  const box = (await page.getByTestId('route-map').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel(page).getByRole('button', { name: 'Spot on the map' })).toBeVisible();
  const n = Number((await count(page).textContent())!.match(/^(\d+)/)![1]);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(174);
  await expect(panel(page).getByRole('tab', { name: `Rides · ${n}` })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).getByRole('tabpanel').getByRole('link')).toHaveCount(Math.min(n, 30));

  // Clearing the spot shows every route again
  await panel(page).getByRole('button', { name: 'Spot on the map' }).click();
  await expect(count(page)).toHaveText(/^174 routes/);
});

test('on a phone the places browser opens as a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map/');
  await expect(panel(page)).toBeHidden();
  await page.getByRole('button', { name: 'Places' }).click();
  const sheet = page.getByRole('dialog', { name: 'Places' });
  await expect(sheet.getByRole('button', { name: /^Canada/ })).toBeVisible();
  await sheet.getByRole('button', { name: /^Canada/ }).click();
  await expect(page).toHaveURL(/[?&]country=CA/);
});
