import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Refs #48: the four feature sections – alternating sides, real UI fragments as shots that bleed off
// the outer edge below ~1800 px, fade out at the bottom and slide in (motion off with reduced motion).

const SECTIONS = [
  { id: 'dashboard', ui: 'intensity', eyebrow: 'your form', heading: 'Form, load, fitness.', copy: 'Pick a period and see what changed – hours, intensity, zones – and what it did to your form.', flip: false },
  { id: 'ride', ui: 'ride', eyebrow: 'every ride', heading: 'Second by second.', copy: 'Power, heart rate, speed and elevation – coloured by zone and tied to the map. Hover the chart, see the spot.', flip: true },
  { id: 'year', ui: 'year', eyebrow: 'your year', heading: 'One page per year.', copy: 'Months, climbs, best efforts – the rides that mattered.', flip: false },
  { id: 'map', ui: 'map', eyebrow: 'every road', heading: 'All your roads, one map.', copy: 'Every track as a heatmap. Filter by year, bike or place – click a road and see every ride that took it.', flip: true },
] as const;

/** Scrolls through the sections so every shot fetches its fragment, then back to the top. */
async function loadShots(page: Page) {
  for (const { id } of SECTIONS) await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  for (const { id, ui } of SECTIONS) {
    if (ui === 'map') await expect(page.locator(`#${id} .feature-shot img:visible`)).toHaveJSProperty('complete', true);
    else await expect(page.locator(`#${id} .feature-shot`)).toHaveAttribute('data-loaded', 'true');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Left/right edge of an element's box in viewport pixels (transforms of the slide-in excluded). */
const edges = (page: Page, selector: string) => page.locator(selector).evaluate((el) => {
  const r = el.getBoundingClientRect();
  const t = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
  return { left: r.left - t.m41, right: r.right - t.m41 };
});

test.beforeEach(async ({ page }) => {
  // Final state of every block unless a test turns motion back on
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('four sections with eyebrow, heading and one line of copy, in order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#features > section')).toHaveCount(4);
  expect(await page.locator('#features > section').evaluateAll((els) => els.map((el) => el.id))).toEqual(SECTIONS.map((s) => s.id));
  for (const s of SECTIONS) {
    const section = page.getByRole('region', { name: s.heading });
    await expect(section).toHaveAttribute('id', s.id);
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(s.heading);
    await expect(section.locator('.eyebrow')).toHaveText(s.eyebrow);
    await expect(section.locator('.feature-text .lede')).toHaveText(s.copy);
  }
});

test('every shot is its real UI fragment, scaled as a whole; the map is the image crop', async ({ page }) => {
  await page.goto('/');
  await loadShots(page);
  for (const { id, ui } of SECTIONS) {
    const shot = page.locator(`#${id} .feature-shot`);
    await expect(shot).toHaveAttribute('aria-hidden', 'true');
    if (ui === 'map') {
      // Two crops, CSS shows the one for the theme (system or the theme switch)
      await expect(shot.locator('img.map-light')).toHaveAttribute('src', 'ui/map-light.webp');
      await expect(shot.locator('img.map-dark')).toHaveAttribute('src', 'ui/map-dark.webp');
      continue;
    }
    const fragment = shot.locator(`> .ui-fragment[data-fragment="${ui}"]`);
    await expect(fragment).toHaveCount(1);
    await expect(fragment).toHaveAttribute('inert', '');
    // Laid out at its own width, scaled down to fill the shot inside its padding
    const [inner, box] = await Promise.all([
      shot.evaluate((el) => el.clientWidth - 2 * parseFloat(getComputedStyle(el).paddingLeft)),
      fragment.boundingBox(),
    ]);
    expect(Math.abs(box!.width - inner), id).toBeLessThanOrEqual(1);
    expect(await fragment.evaluate((el) => (el.firstElementChild as HTMLElement).style.width)).toBe('1120px');
  }
});

test('alternating sides: text left on dashboard and year, right on ride and map', async ({ page }) => {
  await page.goto('/');
  for (const s of SECTIONS) {
    const text = await edges(page, `#${s.id} .feature-text`);
    const media = await edges(page, `#${s.id} .feature-media`);
    if (s.flip) expect(media.right, s.id).toBeLessThanOrEqual(text.left);
    else expect(text.right, s.id).toBeLessThanOrEqual(media.left);
  }
});

test('shots bleed off the outer edge below ~1800 px and are fully visible above', async ({ page }) => {
  for (const width of [1280, 1440, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const s of SECTIONS) {
      const shot = await edges(page, `#${s.id} .feature-shot`);
      const media = await edges(page, `#${s.id} .feature-media`);
      // Pinned to the inner edge (the fragment's key side), cut off at the outer one
      if (s.flip) {
        expect(Math.round(shot.right), `${s.id} @${width}`).toBe(Math.round(media.right));
        expect(shot.left, `${s.id} @${width}`).toBeLessThan(0);
      } else {
        expect(Math.round(shot.left), `${s.id} @${width}`).toBe(Math.round(media.left));
        expect(shot.right, `${s.id} @${width}`).toBeGreaterThan(width);
      }
    }
  }
  for (const width of [1820, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const s of SECTIONS) {
      const shot = await edges(page, `#${s.id} .feature-shot`);
      expect(shot.left, `${s.id} @${width}`).toBeGreaterThanOrEqual(0);
      expect(shot.right, `${s.id} @${width}`).toBeLessThanOrEqual(width);
      expect(shot.right - shot.left).toBeGreaterThan(1000);
    }
  }
});

test('phone: stacked, every shot runs off the right edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const s of SECTIONS) {
    const text = (await page.locator(`#${s.id} .feature-text`).boundingBox())!;
    const media = (await page.locator(`#${s.id} .feature-media`).boundingBox())!;
    expect(media.y, s.id).toBeGreaterThanOrEqual(text.y + text.height);
    const shot = await edges(page, `#${s.id} .feature-shot`);
    expect(shot.left, s.id).toBe(24);
    expect(shot.right, s.id).toBeGreaterThan(390);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`every shot fades out at the bottom (mask, ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    for (const { id } of SECTIONS) {
      const mask = await page.locator(`#${id} .feature-shot`).evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
      // Opaque at the top, transparent at the bottom – a mask, so it works on any background
      expect(mask, id).toMatch(/^linear-gradient\(rgb\(0, 0, 0\) \d+%, rgba\(0, 0, 0, 0\) \d+%\)$/);
    }
  });

  test(`the sections have no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await loadShots(page);
    const { violations } = await new AxeBuilder({ page }).include('#features').analyze();
    expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

for (const width of [390, 1440, 1920, 2560]) {
  test(`no horizontal scroll with every shot loaded at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await loadShots(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('motion: shots slide in from their outer side, lines draw and the calendar fills', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const ride = page.locator('#ride');
  await expect(ride).not.toHaveClass(/\bin\b/);
  // Before the reveal the mirrored shot waits off to the left
  expect(await ride.locator('.feature-shot').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBeLessThan(0);
  await loadShots(page);
  for (const { id } of SECTIONS) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`)).toHaveClass(/\bin\b/);
  }
  const animation = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);
  expect(await page.locator('#ride [data-draw]').count()).toBeGreaterThan(0);
  expect(await animation('#ride [data-draw]')).toBe('feature-draw');
  expect(await animation('#year [data-draw]')).toBe('feature-draw');
  expect(await animation('#year [role=grid] [data-day]')).toBe('feature-cell');
  expect(await animation('#dashboard .recharts-bar-rectangle path')).toBe('feature-grow');
  // …and everything ends in the fragment's own state
  await expect(ride.locator('.feature-shot')).toHaveCSS('transform', 'none', { timeout: 4000 });
  await expect(page.locator('#year [role=grid] [data-day]').last()).toHaveCSS('opacity', '1', { timeout: 4000 });
});

test('reduced motion: shots in place at once, no animation inside them', async ({ page }) => {
  await page.goto('/');
  await loadShots(page);
  for (const { id } of SECTIONS) {
    await expect(page.locator(`#${id}`)).toHaveCSS('opacity', '1');
    await expect(page.locator(`#${id} .feature-shot`)).toHaveCSS('transform', 'none');
  }
  for (const selector of ['#ride [data-draw]', '#year [role=grid] [data-day]', '#dashboard .recharts-bar-rectangle path']) {
    const names = await page.locator(selector).evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).animationName))]);
    expect(names, selector).toEqual(['none']);
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('every section is visible, the map shot still shows', async ({ page }) => {
    await page.goto('/');
    for (const { id } of SECTIONS) await expect(page.locator(`#${id}`)).toHaveCSS('opacity', '1');
    await page.locator('#map').scrollIntoViewIfNeeded();
    await expect(page.locator('#map .feature-shot img:visible')).toHaveJSProperty('complete', true);
  });
});
