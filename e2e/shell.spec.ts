import AxeBuilder from '@axe-core/playwright';
import { expect, hydrated, test, type Page } from './fixtures';
import { STATIC_PAGES } from './pages';

const SECTIONS = [
  { name: 'Dashboard', path: '/' },
  { name: 'Rides', path: '/rides' },
  { name: 'Years', path: '/years' },
  { name: 'Map', path: '/map' },
  { name: 'Segments', path: '/segments' },
  { name: 'Performance', path: '/performance' },
  { name: 'Gear', path: '/gear' },
];
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

test('the sidebar reaches every section and marks the current one', async ({ page }) => {
  await page.goto('/');
  for (const { name, path } of SECTIONS) {
    await nav(page).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}/?$`));
    const current = nav(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(name);
  }
});

test('a detail page shows its section and title as breadcrumbs', async ({ page }) => {
  await page.goto('/years/');
  const year = await page.locator('a[href*="/years/2"]').first().getAttribute('href');
  await page.goto(year!);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Years' })).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(/^\d{4}$/);
});

test('a collapsed sidebar stays collapsed across pages, from the first paint', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('[data-slot="sidebar"]');
  await expect(sidebar).toHaveAttribute('data-state', 'expanded');
  await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

  // Before any script of the page has run (no JS = the parsed HTML plus inline scripts)
  await page.goto('/rides/', { waitUntil: 'domcontentloaded' });
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  await hydrated(page);
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
});

test('in the collapsed sidebar the logo, the nav icons, the demo note and the theme switch share one centre line', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
  await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
  const centres = await page.evaluate(() => {
    const icons = [
      document.querySelector('[data-slot="app-mark"]'),
      ...document.querySelectorAll('[data-sidebar="sidebar"] nav a svg'),
      document.querySelector('[data-demo-note] svg'),
      document.querySelector('[data-testid="theme-menu"] svg'),
    ].filter((el): el is Element => !!el && el.getBoundingClientRect().width > 0);
    return icons.map((el) => { const b = el.getBoundingClientRect(); return Math.round(b.left + b.width / 2); });
  });
  expect(centres.length).toBeGreaterThan(5);
  expect(new Set(centres).size, `icon centres: ${centres.join(', ')}`).toBe(1);
});

test('the theme switches light/dark and is applied before paint on the next page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await page.getByTestId('theme-menu').click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(html).toHaveClass(/dark/);

  // The class is already set when the HTML has been parsed, i.e. before the first paint
  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  await hydrated(page);

  expect(await page.evaluate(() => localStorage.getItem('rc_theme'))).toBe('dark');

  // Auto: stored as a choice of its own, follows the system
  await page.getByTestId('theme-menu').click();
  await page.getByRole('menuitemradio', { name: 'Auto' }).click();
  await expect(html).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('rc_theme'))).toBe('auto');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass(/dark/);
});

test('the app is light by default – also on a dark system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear()); // the config seeds "auto"
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  await hydrated(page);
  await expect(page.getByTestId('theme-menu')).toContainText('Light');
  expect(await page.evaluate(() => localStorage.getItem('rc_theme'))).toBeNull();
  // Ignores the website's key
  await page.evaluate(() => localStorage.setItem('rc_site_theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('the chosen period is shared by the dashboard and the ride log', async ({ page }) => {
  await page.goto('/');
  const period = page.getByRole('radiogroup', { name: 'Period' });
  await period.getByRole('radio', { name: '7 days' }).click();
  await expect(period.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/rides/');
  await expect(page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
});

test('the demo data indicator links to the setup steps', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-demo-note]')).toHaveAttribute('href', /#quick-start$/);
});

// Accessibility of every page, light and dark.
for (const scheme of ['light', 'dark'] as const) {
  for (const url of STATIC_PAGES) {
    test(`${url} shell has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url, { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
