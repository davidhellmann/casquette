import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

const log = (page: Page) => page.getByRole('table', { name: 'Ride log' });
// Ride rows, without the week/month header rows
const bodyRows = (page: Page) => log(page).locator('tbody tr:not([data-group])');
const period = (page: Page) => page.getByRole('radiogroup', { name: 'Period' });
const summary = (page: Page) => page.getByTestId('table-summary');

/** Text of every visible row in the column with the given header. */
async function columnTexts(page: Page, header: string) {
  const headers = await log(page).locator('thead th').allTextContents();
  const i = headers.findIndex((h) => h.trim() === header);
  expect(i, `column ${header}`).toBeGreaterThanOrEqual(0);
  return bodyRows(page).evaluateAll((rows, i) => rows.map((r) => r.children[i]?.textContent?.trim() || ''), i);
}
const num = (s: string) => (s === '–' ? null : Number(s.replace(/[^\d.-]/g, '')));

async function openAllTime(page: Page) {
  await page.goto('/rides/');
  await period(page).getByRole('radio', { name: 'All time' }).click();
  await expect(bodyRows(page)).toHaveCount(25);
}

test('pages through the rides, 25 per page', async ({ page }) => {
  await openAllTime(page);
  const info = page.getByTestId('table-page');
  await expect(info).toHaveText(/page 1 of (\d+)/i);
  const pages = Number((await info.textContent())!.match(/of (\d+)/)![1]);
  expect(pages).toBeGreaterThan(1);
  const first = await bodyRows(page).first().textContent();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(info).toHaveText(new RegExp(`page 2 of ${pages}`, 'i'));
  await expect(bodyRows(page).first()).not.toHaveText(first!);

  await page.getByRole('button', { name: 'Last page' }).click();
  await expect(info).toHaveText(new RegExp(`page ${pages} of ${pages}`, 'i'));
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'First page' }).click();
  await expect(info).toHaveText(new RegExp(`page 1 of ${pages}`, 'i'));
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});

test('sorts by a column header, numbers right-aligned', async ({ page }) => {
  await openAllTime(page);
  const km = log(page).locator('thead th').filter({ hasText: /^Distance$/ });
  await expect(km).toHaveCSS('text-align', 'right');

  await km.getByRole('button').click();
  await expect(km).toHaveAttribute('aria-sort', 'descending');
  const desc = (await columnTexts(page, 'Distance')).map(num) as number[];
  expect(desc).toEqual([...desc].sort((a, b) => b - a));

  await km.getByRole('button').click();
  await expect(km).toHaveAttribute('aria-sort', 'ascending');
  const asc = (await columnTexts(page, 'Distance')).map(num) as number[];
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  expect(asc[0]).toBeLessThan(desc[0]);

  const cell = bodyRows(page).first().locator('td').nth((await log(page).locator('thead th').allTextContents()).indexOf('Distance'));
  await expect(cell).toHaveCSS('text-align', 'right');
  await expect(cell).toHaveCSS('font-variant-numeric', 'tabular-nums');
});

test('searches by ride name and by place', async ({ page }) => {
  await openAllTime(page);
  const search = page.getByRole('searchbox', { name: 'Search rides' });

  await search.fill('recovery');
  await expect(bodyRows(page).first()).toContainText(/Recovery/i);
  for (const name of await columnTexts(page, 'Ride')) expect(name).toMatch(/recovery/i);

  // A place the ride passed through, not part of any ride name
  await search.fill('Richmond');
  await expect(summary(page)).not.toContainText(/^0 rides/);
  const names = await bodyRows(page).locator('td:nth-child(2) a').allTextContents();
  expect(names.some((n) => !/richmond/i.test(n))).toBe(true);

  await search.fill('no ride is called like this');
  await expect(log(page).getByText('No rides found')).toBeVisible();
  await expect(summary(page)).toContainText(/^0 rides/);
});

test('hides and shows columns', async ({ page }) => {
  await page.goto('/rides/');
  await expect(log(page).locator('thead th').filter({ hasText: /^NP$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'NP' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(log(page).locator('thead th').filter({ hasText: /^NP$/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'NP' }).click();
  await expect(log(page).locator('thead th').filter({ hasText: /^NP$/ })).toHaveCount(1);
});

test('a row click opens the ride', async ({ page }) => {
  await page.goto('/rides/');
  const row = bodyRows(page).first();
  const href = await row.getByRole('link').getAttribute('href');
  expect(href).toMatch(/\/rides\/[^/]+\/?$/);
  await row.locator('td').last().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('the period chosen on the ride log is active on the dashboard and filters the log', async ({ page }) => {
  await page.goto('/rides/');
  await expect(summary(page)).toBeVisible();
  const initial = (await summary(page).textContent())!;
  await period(page).getByRole('radio', { name: 'All time' }).click();
  // The summary is already there: wait for the re-render instead of reading the previous count
  await expect(summary(page)).not.toHaveText(initial);
  const all = num((await summary(page).textContent())!.split(' ')[0])!;
  await period(page).getByRole('radio', { name: '7 days' }).click();
  await expect(summary(page)).not.toHaveText(new RegExp(`^${all} rides`));
  const week = num((await summary(page).textContent())!.split(' ')[0])!;
  expect(week).toBeLessThan(all);

  await page.goto('/');
  await expect(period(page).getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
});

test('the dashboard lists the recent rides and links to the ride log', async ({ page }) => {
  await page.goto('/');
  const recent = page.getByRole('table', { name: 'Recent rides' });
  await expect(recent.locator('tbody tr').first()).toBeVisible();
  expect(await recent.locator('tbody tr').count()).toBeLessThanOrEqual(10);
  const href = await recent.locator('tbody tr').first().getByRole('link').getAttribute('href');
  await recent.locator('tbody tr').first().locator('td').last().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  await page.goto('/');
  await page.getByRole('link', { name: 'Open ride log' }).click();
  await expect(page).toHaveURL(/\/rides\/?$/);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the ride log has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/rides/');
    await expect(bodyRows(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Columns' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
