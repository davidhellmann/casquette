import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

const list = (page: Page) => page.getByRole('table', { name: 'Segments' });
const bodyRows = (page: Page) => list(page).locator('tbody tr');
/** A demo segment with power, heart rate and second-by-second data on its fastest attempts. */
const DETAIL = '/segments/demo-seg-london-box-hill/';
const CARDS = ['segment-kpis', 'attempts-chart', 'pr-history', 'segment-map', 'watts-chart', 'elevation-chart', 'attempts-table'];

/** Text of every visible row in the column with the given header. */
async function columnTexts(page: Page, header: string) {
  const headers = (await list(page).locator('thead th').allTextContents()).map((h) => h.trim());
  const i = headers.indexOf(header);
  expect(i, `column ${header}`).toBeGreaterThanOrEqual(0);
  return bodyRows(page).evaluateAll((rows, i) => rows.map((r) => r.children[i]?.textContent?.trim() || ''), i);
}
/** "12:34" / "1:02:03" → seconds, "–" → null */
const clock = (s: string) => (s === '–' ? null : s.split(':').reduce((a, x) => a * 60 + Number(x), 0));
const num = (s: string) => (s === '–' ? null : Number(s.replace(/[^\d.-]/g, '')));

test('the segment list shows its KPIs', async ({ page }) => {
  await page.goto('/segments/');
  await expect(list(page)).toBeVisible();
  await expect(page.getByTestId('segment-kpis')).toBeVisible();
});

test('lists the segments by attempts and sorts by a column header', async ({ page }) => {
  await page.goto('/segments/');
  const attempts = (await columnTexts(page, 'Attempts')).map(num) as number[];
  expect(attempts.length).toBe(25);
  expect(attempts).toEqual([...attempts].sort((a, b) => b - a));

  const best = list(page).locator('thead th').filter({ hasText: /^Best time$/ });
  await best.getByRole('button').click();
  await expect(best).toHaveAttribute('aria-sort', 'descending');
  const desc = (await columnTexts(page, 'Best time')).map(clock).filter((v) => v != null) as number[];
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await best.getByRole('button').click();
  await expect(best).toHaveAttribute('aria-sort', 'ascending');
  const asc = (await columnTexts(page, 'Best time')).map(clock).filter((v) => v != null) as number[];
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  expect(asc[0]).toBeLessThan(desc[0]);
});

test('searches segments by name and place, filters climbs', async ({ page }) => {
  await page.goto('/segments/');
  const search = page.getByRole('searchbox', { name: 'Search segments' });
  await search.fill('box hill');
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(bodyRows(page).first()).toContainText('Box Hill');

  await search.fill('London');
  expect((await columnTexts(page, 'Segment')).length).toBeGreaterThan(1);
  for (const name of await columnTexts(page, 'Segment')) expect(name).toMatch(/London/);

  await search.fill('no segment is called like this');
  await expect(list(page).getByText('No segments found')).toBeVisible();

  await search.fill('');
  await page.getByRole('radio', { name: 'Climbs' }).click();
  const grades = (await columnTexts(page, 'Grade')).map(num) as number[];
  expect(grades.length).toBeGreaterThan(0);
  for (const g of grades) expect(g).toBeGreaterThanOrEqual(3);
});

test('a segment row opens its detail page', async ({ page }) => {
  await page.goto('/segments/');
  await page.getByRole('searchbox', { name: 'Search segments' }).fill('box hill');
  await bodyRows(page).first().locator('td').last().click();
  await expect(page).toHaveURL(/\/segments\/demo-seg-london-box-hill\/?$/);
});

test('a demo segment detail renders every card', async ({ page }) => {
  await page.goto(DETAIL);
  await expect(page.getByRole('heading', { level: 1, name: /Box Hill/ })).toBeVisible();
  for (const id of CARDS) await expect(page.getByTestId(id), id).toBeVisible();
  for (const id of ['attempts-chart', 'watts-chart', 'elevation-chart']) {
    await expect(page.getByTestId(id).locator('.recharts-surface').first(), id).toBeVisible();
  }
  // The map draws the segment from the fastest ride's second-by-second data
  await expect(page.getByTestId('segment-map').locator('.leaflet-overlay-pane path').first()).toBeAttached();
  await expect(page.getByTestId('pr-history').getByRole('link').first()).toHaveAttribute('href', /\/rides\//);
  await expect(page.getByTestId('attempts-table').locator('tbody tr').first()).toBeVisible();
});

test('attempts are drawn hard (linear), the best time so far as steps', async ({ page }) => {
  await page.goto(DETAIL);
  const chart = page.getByTestId('attempts-chart');
  const lines = chart.locator('.recharts-line-curve');
  await expect(lines).toHaveCount(2);
  for (const d of await lines.evaluateAll((ls) => ls.map((l) => l.getAttribute('d') || ''))) expect(d).not.toMatch(/[CQ]/);
  // Watts vs. time: one point per attempt with power, no smoothed line
  await expect(page.getByTestId('watts-chart').locator('.recharts-scatter-symbol').first()).toBeVisible();
  await expect(page.getByTestId('watts-chart').locator('path[d*="C"].recharts-curve')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const path of ['/segments/', DETAIL]) {
    test(`${path} has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
