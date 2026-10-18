import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const CHARTS = ['ftp-chart', 'wkg-chart', 'long-term-fitness-chart', 'power-curve-chart'];

test('every chart renders or shows its empty state', async ({ page }) => {
  await page.goto('/performance/');
  for (const id of CHARTS) {
    const card = page.getByTestId(id);
    await expect(card.locator('.recharts-surface, [data-slot="empty-state"]').first()).toBeVisible();
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the performance page has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/performance/', { waitUntil: 'networkidle' });
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('FTP history is drawn as steps, long-term fitness as a smooth curve', async ({ page }) => {
  await page.goto('/performance/');
  // Steps: straight segments that are each horizontal or vertical
  const ftp = (await page.getByTestId('ftp-chart').locator('.recharts-line-curve').getAttribute('d'))!;
  expect(ftp).not.toMatch(/[CQ]/);
  const points = [...ftp.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  expect(points.length).toBeGreaterThan(2);
  expect(points.slice(1).every(([x, y], i) => x === points[i][0] || y === points[i][1])).toBe(true);
  expect(new Set(points.map(([, y]) => y)).size).toBeGreaterThan(1);
  // Smooth (monotone): cubic Bézier segments
  const fitness = await page.getByTestId('long-term-fitness-chart').locator('.recharts-area-curve').getAttribute('d');
  expect(fitness).toMatch(/C/);
});

test('the power curve shows watts and W/kg on hover', async ({ page }) => {
  await page.goto('/performance/');
  const chart = page.getByTestId('power-curve-chart');
  const box = (await chart.locator('.recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(chart.getByText(/\d W · \d+\.\d\d W\/kg/).first()).toBeVisible();
});

test('the power profile links each best to its ride and each year to its page', async ({ page }) => {
  await page.goto('/performance/');
  const profile = page.getByTestId('power-profile');
  await expect(profile.locator('a[href*="/rides/"]').first()).toBeVisible();
  await expect(profile.locator('a[href*="/years/"]').first()).toBeVisible();
  await expect(page.getByTestId('ftp-history').locator('tbody tr').first()).toBeVisible();
});

test('the FTP history and the power profile sort like every other table', async ({ page }) => {
  await page.goto('/performance/');
  const history = page.getByTestId('ftp-history');
  const ftp = history.getByRole('columnheader', { name: 'FTP' });
  await ftp.getByRole('button').click();
  await expect(ftp).toHaveAttribute('aria-sort', /ascending|descending/);
  const values = async () => (await history.locator('tbody tr td:nth-child(2)').allTextContents()).map((v) => parseInt(v, 10)).filter(Number.isFinite);
  const first = await values();
  expect(first.length).toBeGreaterThan(1);
  const sorted = [...first].sort((a, b) => a - b);
  expect([sorted, [...sorted].reverse()]).toContainEqual(first);

  const profile = page.getByTestId('power-profile');
  const year = profile.getByRole('columnheader', { name: 'Year' });
  await year.getByRole('button').click();
  await expect(year).toHaveAttribute('aria-sort', /ascending|descending/);
});
