import AxeBuilder from '@axe-core/playwright';
import { expect, hydrated, test, type Page } from './fixtures';

// Sidebar submenus: Rides (last 5 + "All rides"), Years (latest 3 + "All years") and Gear (active bikes + "All gear").
// Demo dataset: Steel Classic is retired, the other three bikes are active.
const ACTIVE_BIKES = ['Carbon Endurance', 'Gravel All-Road', 'Indoor Trainer'];
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const sub = (page: Page, name: string) => nav(page).getByRole('list', { name });
const toggle = (page: Page, name: string) => nav(page).getByRole('button', { name: `Toggle ${name}` });

/** The demo years, newest first – from the year cards of /years/. */
async function demoYears(page: Page) {
  await page.goto('/years/');
  const cards = page.getByTestId('year-cards').getByRole('link');
  await expect(cards.first()).toBeVisible();
  return (await cards.allTextContents()).map((s) => +s.match(/\d{4}/)![0]);
}

test('the Rides submenu lists the last five rides with date and km and links to all rides', async ({ page }) => {
  await page.goto('/rides/');
  // On the ride log the section's submenu is open
  const links = sub(page, 'Rides').getByRole('link');
  await expect(links).toHaveCount(6);
  for (let i = 0; i < 5; i++) await expect(links.nth(i).getByTestId('entry-detail')).toHaveText(/^\d{1,2} \w{3} · [\d,.]+ km$/);
  await expect(links.last()).toHaveText(/^All rides/);
  await expect(links.last()).toHaveAttribute('href', /\/rides\/?$/);
  await links.first().click();
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
  await expect(sub(page, 'Rides').locator('[aria-current="page"]')).toHaveCount(1);
});

test('the Years submenu lists the latest three years with km and links to all years', async ({ page }) => {
  const years = await demoYears(page);
  await page.goto('/map/');
  await expect(sub(page, 'Years')).toBeHidden();
  await toggle(page, 'Years').click();
  await expect(toggle(page, 'Years')).toHaveAttribute('aria-expanded', 'true');
  const links = sub(page, 'Years').getByRole('link');
  await expect(links).toHaveCount(Math.min(3, years.length) + 1);
  for (const [i, y] of years.slice(0, 3).entries()) {
    await expect(links.nth(i)).toHaveText(new RegExp(`^${y}\\s*[\\d,.]+ km$`));
    await expect(links.nth(i)).toHaveAttribute('href', new RegExp(`/years/${y}/?$`));
  }
  await expect(links.last()).toHaveText(/^All years/);
  await expect(links.last()).toHaveAttribute('href', /\/years\/?$/);
});

test('the Gear submenu lists the active bikes with their km, retired bikes only on the overview', async ({ page }) => {
  await page.goto('/map/');
  await toggle(page, 'Gear').click();
  const links = sub(page, 'Gear').getByRole('link');
  await expect(links).toHaveCount(ACTIVE_BIKES.length + 1);
  for (const name of ACTIVE_BIKES) await expect(links.filter({ hasText: name })).toHaveText(new RegExp(`^${name}\\s*[\\d,.]+ km$`));
  await expect(links.filter({ hasText: 'Steel Classic' })).toHaveCount(0);
  await expect(links.last()).toHaveText(/^All gear/);
  await expect(links.last()).toHaveAttribute('href', /\/gear\/?$/);

  // No marker dot; the km sit in a second line below the name
  const first = links.first();
  const name = (await first.getByText(ACTIVE_BIKES[0]).boundingBox())!;
  const km = (await first.getByTestId('entry-detail').boundingBox())!;
  expect(km.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  expect(Math.abs(km.x - name.x)).toBeLessThanOrEqual(1);
});

test('the open state is remembered across pages, before the first paint', async ({ page }) => {
  await page.goto('/map/');
  await toggle(page, 'Gear').click();
  await expect(sub(page, 'Gear')).toBeVisible();
  await page.goto('/performance/', { waitUntil: 'domcontentloaded' });
  await expect(sub(page, 'Gear')).toBeVisible();
  await hydrated(page);
  await expect(sub(page, 'Gear')).toBeVisible();
  await toggle(page, 'Gear').click();
  await page.goto('/map/');
  await expect(sub(page, 'Gear')).toBeHidden();
});

test('on a year page the Years group is open and marks the year', async ({ page }) => {
  const [y] = await demoYears(page);
  await page.goto(`/years/${y}/`);
  await expect(toggle(page, 'Years')).toHaveAttribute('aria-expanded', 'true');
  const current = nav(page).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(new RegExp(`^${y}`));
  await expect(sub(page, 'Gear')).toBeHidden();
});

test('on a bike page the Gear group is open and marks the bike', async ({ page }) => {
  await page.goto('/gear/');
  await page.getByTestId('bike-card').getByRole('link', { name: 'Gravel All-Road', exact: true }).click();
  await expect(toggle(page, 'Gear')).toHaveAttribute('aria-expanded', 'true');
  const current = nav(page).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/^Gravel All-Road/);
});

test('in the collapsed sidebar the icon opens a flyout with the same entries', async ({ page }) => {
  await page.goto('/map/');
  await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
  await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
  await nav(page).getByRole('button', { name: 'Gear', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(ACTIVE_BIKES.length + 1);
  await expect(menu.getByRole('menuitem').last()).toHaveText(/^All gear/);
  await menu.getByRole('menuitem', { name: /^Indoor Trainer/ }).click();
  await expect(page).toHaveURL(/\/gear\/[^/]+\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Indoor Trainer');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sheet shows the same groups', async ({ page }) => {
    await page.goto('/map/');
    await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Toggle Years' }).click();
    await expect(sheet.getByRole('list', { name: 'Years' }).getByRole('link').last()).toHaveText(/^All years/);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`open submenus have no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const [y] = await demoYears(page);
    await page.goto(`/years/${y}/`, { waitUntil: 'networkidle' });
    await toggle(page, 'Gear').click();
    const { violations } = await new AxeBuilder({ page }).include('[data-slot="sidebar"]').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
