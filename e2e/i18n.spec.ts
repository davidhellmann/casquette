import { expect, test } from './fixtures';
import { pageTitle, t } from '../src/i18n/index.ts';
import { DETAIL_PAGES, firstLink } from './pages';

// Every page's document title, its one <h1> and the sidebar come from the i18n strings (#26
// Testing Decisions) – compared against t() itself, so a hard-coded label fails here.

const NAV_KEYS = ['dashboard', 'rides', 'years', 'map', 'segments', 'performance', 'gear'];
const SECTIONS = [
  { path: '/', active: 'dashboard', h1: t('nav.dashboard'), title: pageTitle() },
  { path: '/rides/', active: 'rides', h1: t('log.title'), title: pageTitle(t('log.title')) },
  { path: '/years/', active: 'years', h1: t('years.title'), title: pageTitle(t('years.title')) },
  { path: '/map/', active: 'map', h1: t('map.title'), title: pageTitle(t('map.title')) },
  { path: '/segments/', active: 'segments', h1: t('segments.title'), title: pageTitle(t('segments.title')) },
  { path: '/performance/', active: 'performance', h1: t('perf.title'), title: pageTitle(t('perf.title')) },
  { path: '/gear/', active: 'gear', h1: t('gear.title'), title: pageTitle(t('gear.title')) },
];

for (const { path, active, h1, title } of SECTIONS) {
  test(`${path}: document title, h1 and sidebar labels come from i18n`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(h1);

    const nav = page.getByRole('navigation', { name: t('nav.mainAria') });
    // Section links (the submenu entries of Years/Gear are data: years, bike names)
    await expect(nav.locator('a[data-sidebar="menu-button"]')).toHaveText(NAV_KEYS.map((k) => t(`nav.${k}`)));
    for (const sub of ['years', 'gear']) await expect(nav.getByRole('button', { name: t('nav.subToggle', { name: t(`nav.${sub}`) }) })).toBeAttached();
    if (active === 'years' || active === 'gear') await expect(nav.getByRole('link', { name: t(`nav.all.${active}`) })).toBeVisible();
    await expect(nav.getByText(t('nav.groupTraining'), { exact: true })).toBeAttached();
    await expect(nav.getByText(t('nav.groupExplore'), { exact: true })).toBeAttached();
    await expect(nav.locator('[aria-current="page"]')).toHaveText(t(`nav.${active}`));
    await expect(page.getByRole('navigation', { name: t('nav.breadcrumbAria') })).toContainText(t(`nav.${active}`));
  });
}

for (const { name, index, link } of DETAIL_PAGES) {
  test(`a ${name} page has one h1 and the document title names it`, async ({ page }) => {
    await page.goto(index);
    await page.goto(await firstLink(page, link));
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(pageTitle((await h1.textContent())!.trim()));
  });
}
