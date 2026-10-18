import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const calendar = (page) => page.getByRole('grid', { name: 'Training calendar' });
/** Monday = 0 … Sunday = 6, like the calendar rows. */
const weekday = (d: Date) => (d.getDay() + 6) % 7;

test('the training calendar shows the last 52 weeks plus the current one, day by day', async ({ page }) => {
  await page.goto('/');
  const grid = calendar(page);
  await expect(grid.getByRole('row')).toHaveCount(7);
  // 52 full weeks, then this week up to today – no future days
  await expect(grid.getByRole('gridcell')).toHaveCount(52 * 7 + weekday(new Date()) + 1);
  for (const [i, day] of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].entries())
    await expect(grid.getByRole('row').nth(i).getByRole('rowheader')).toHaveAccessibleName(day);
});

test('hovering or focusing a day shows date, rides, duration, load and names – or a rest day', async ({ page }) => {
  await page.goto('/');
  const grid = calendar(page);
  const tip = page.getByRole('tooltip');
  const ride = grid.getByRole('link').last();
  await ride.hover();
  await expect(tip).toContainText((await ride.getAttribute('aria-label'))!);
  await expect(tip).toContainText(/\d+ rides? · (\d+:\d\d h|\d+ min) · load \d+/);
  await expect(ride).toHaveAccessibleDescription(/load \d+/);

  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  const rest = grid.getByRole('gridcell').filter({ hasNot: page.getByRole('link') }).last();
  await rest.focus();
  await expect(tip).toContainText((await rest.getAttribute('aria-label'))!);
  await expect(tip).toContainText('Rest day');
});

test('the keyboard moves through the days: arrows by day and week, Home/End along the row', async ({ page }) => {
  await page.goto('/');
  const grid = calendar(page);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return fmt(d); };
  const focused = page.locator(':focus');
  const k = weekday(new Date());

  // One tab stop in the grid: today
  const stop = grid.locator('[tabindex="0"]');
  await expect(stop).toHaveCount(1);
  await stop.focus();
  await expect(focused).toHaveAttribute('aria-label', day(0));
  await expect(page.getByRole('tooltip')).toContainText(day(0));

  await page.keyboard.press('ArrowLeft');
  await expect(focused).toHaveAttribute('aria-label', day(-7));
  await expect(page.getByRole('tooltip')).toContainText(day(-7));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(focused).toHaveAttribute('aria-label', day(-7));
  await page.keyboard.press('ArrowDown');
  await expect(focused).toHaveAttribute('aria-label', day(k < 6 ? -6 : -7));
  await page.keyboard.press('ArrowUp');
  await expect(focused).toHaveAttribute('aria-label', day(k < 6 ? -7 : -8));
  await page.keyboard.press('Control+End');
  await expect(focused).toHaveAttribute('aria-label', day(0));
  await page.keyboard.press('Home');
  await expect(focused).toHaveAttribute('aria-label', day(-7 * 52));
  await page.keyboard.press('End');
  await expect(focused).toHaveAttribute('aria-label', day(0));
  await page.keyboard.press('ArrowDown'); // tomorrow is not in the calendar yet
  await expect(focused).toHaveAttribute('aria-label', day(0));
  await page.keyboard.press('Control+Home');
  await expect(focused).toHaveAttribute('aria-label', day(-7 * 52 - k));
  await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
});

test('Enter or a click on a day with a ride opens the ride', async ({ page }) => {
  await page.goto('/');
  const ride = calendar(page).getByRole('link').last();
  const href = (await ride.getAttribute('href'))!;
  expect(href).toMatch(/\/rides\/[^/]+$/);
  await ride.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href}/?$`));

  await page.goBack();
  await calendar(page).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/rides\/[^/]+\/?$/);
});

test('summary stats and the less → more legend sit under the grid', async ({ page }) => {
  await page.goto('/');
  const stats = page.getByTestId('calendar-stats');
  const stat = (label: string) => stats.locator('div').filter({ has: page.getByRole('term').getByText(label, { exact: true }) }).getByRole('definition');
  for (const label of ['active days', 'longest streak (days)', 'current streak', 'consecutive weeks with a ride', 'avg hours / week'])
    await expect(stat(label)).toHaveText(/^[\d,.]+$/);
  const rideDays = await calendar(page).getByRole('link').count();
  expect(rideDays).toBeGreaterThan(0);
  await expect(stat('active days')).toHaveText(String(rideDays));
  await expect(page.getByTestId('calendar-legend')).toHaveText(/less\s*more/);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the calendar has no accessibility violations, tooltip open (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await calendar(page).locator('[tabindex="0"]').focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const card = page.locator('[data-slot="chart-card"]').filter({ has: calendar(page) });
    await card.evaluate((el) => el.setAttribute('data-axe', 'calendar'));
    const { violations } = await new AxeBuilder({ page }).include('[data-axe="calendar"]').analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
