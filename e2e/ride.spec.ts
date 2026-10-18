import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

// Demo ride with power, heart rate, GPS, 3 laps, 1 segment and 29 km splits.
const RIDE = '/rides/demo-0149/';
// Stream charts: power, heart rate, cadence, speed, elevation
const STREAMS = ['watts', 'hr', 'cad', 'kmh', 'alt'];

const streams = (page: Page) => page.getByTestId('ride-streams');
const streamChart = (page: Page, name: string) => streams(page).locator(`[data-stream="${name}"]`);

/** A synthetic 6-hour ride at 1 Hz (21,600 samples) along a straight line. */
function longStream() {
  const n = 6 * 3600;
  const time = Array.from({ length: n }, (_, i) => i);
  const wave = (i: number, a: number, p: number) => Math.round(a * Math.sin(i / p));
  return {
    time,
    watts: time.map((i) => (i % 900 === 0 ? 900 : 200 + wave(i, 60, 37))),
    heart_rate: time.map((i) => 140 + wave(i, 15, 400)),
    cadence: time.map((i) => 88 + wave(i, 6, 50)),
    velocity: time.map((i) => 8 + wave(i, 2, 300) / 1),
    altitude: time.map((i) => 400 + wave(i, 120, 2000)),
    distance: time.map((i) => i * 8),
    latlng: time.map((i) => [48.1 + i * 0.00002, 11.5 + i * 0.00002]),
  };
}

test('breadcrumbs lead back to the ride log', async ({ page }) => {
  await page.goto(RIDE);
  const name = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(name);
  await crumbs.getByRole('link', { name: 'Rides' }).click();
  await expect(page).toHaveURL(/\/rides\/?$/);
});

test('a hint near the map says that hovering the streams marks the position', async ({ page }) => {
  await page.goto(RIDE);
  await expect(page.getByTestId('ride-map').getByTestId('map-tip')).toHaveText('Tip: hover over the stream chart → position on the map');
});

test('the route map shows the ride coloured by zone', async ({ page }) => {
  await page.goto(RIDE);
  const map = page.getByTestId('ride-map');
  await expect(map.locator('.leaflet-container')).toBeVisible();
  const route = map.locator('path.leaflet-interactive');
  await expect(route.first()).toBeVisible();
  const colours = new Set(await route.evaluateAll((ps) => ps.map((p) => p.getAttribute('stroke'))));
  expect(colours.size).toBeGreaterThan(2);
  await expect(map.getByText('Z1', { exact: true })).toBeVisible();
});

test('the streams render as linear lines with a shared hover that follows on the map', async ({ page }) => {
  await page.goto(RIDE);
  for (const name of STREAMS) await expect(streamChart(page, name).locator('.recharts-surface')).toBeVisible();
  // Hard lines: point by point, no Bézier curves
  const d = (await streamChart(page, 'hr').locator('.recharts-line-curve, .recharts-area-curve').first().getAttribute('d'))!;
  expect(d).not.toMatch(/[CQ]/);

  const surface = streamChart(page, 'watts').locator('.recharts-surface');
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  // One hover, a cursor in every stream chart
  const xs = new Set<string>();
  for (const name of STREAMS) {
    const cursor = streamChart(page, name).locator('.recharts-tooltip-cursor');
    await expect(cursor).toHaveCount(1);
    xs.add((await cursor.getAttribute('d'))!.match(/^M([\d.]+)/)![1]);
  }
  expect(xs.size).toBe(1);
  const readout = page.getByTestId('stream-readout');
  await expect(readout).toContainText(/\d+:\d\d:\d\d/);
  await expect(readout).toContainText(/\d+ W/);
  await expect(readout).toContainText(/\d+ bpm/);
  await expect(page.getByTestId('ride-map').locator('[data-hover-marker]')).toHaveCount(1);
});

test('power and heart rate are coloured by their zones, cadence, speed and elevation stay grey', async ({ page }) => {
  await page.goto(RIDE);
  for (const name of ['watts', 'hr']) {
    const curve = streamChart(page, name).locator('.recharts-area-curve, .recharts-line-curve').first();
    await expect(curve).toBeVisible();
    const stroke = (await curve.getAttribute('stroke'))!;
    expect(stroke, name).toMatch(/^url\(#.+\)$/);
    const zones = await page.locator(`${stroke.slice(4, -1)} stop`).evaluateAll((stops) => stops.map((s) => s.getAttribute('stop-color')));
    expect(zones.every((z) => /^var\(--zone-[1-7]\)$/.test(z!)), name).toBe(true);
    expect(new Set(zones).size, name).toBeGreaterThan(1);
  }
  // The power area is filled in the same zone colours
  const fill = (await streamChart(page, 'watts').locator('.recharts-area-area').first().getAttribute('fill'))!;
  const fills = await page.locator(`${fill.slice(4, -1)} stop`).evaluateAll((stops) => stops.map((s) => s.getAttribute('stop-color')));
  expect(new Set(fills).size).toBeGreaterThan(1);

  const grey = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.color = 'var(--muted-foreground)';
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  for (const name of ['cad', 'kmh', 'alt']) {
    const curve = streamChart(page, name).locator('.recharts-area-curve, .recharts-line-curve').first();
    expect(await curve.evaluate((el) => getComputedStyle(el).stroke), name).toBe(grey);
  }
});

test('a long ride is downsampled for display and stays responsive while hovering', async ({ page }) => {
  await page.route('**/streams/demo-0149.json', (route) => route.fulfill({ json: longStream() }));
  await page.goto(RIDE);
  const power = streamChart(page, 'watts');
  await expect(power.locator('.recharts-surface')).toBeVisible();
  // Display only: far fewer points than the 21,600 samples
  const d = (await power.locator('.recharts-area-curve, .recharts-line-curve').first().getAttribute('d'))!;
  const points = d.split(/[ML]/).length - 1;
  expect(points).toBeGreaterThan(200);
  expect(points).toBeLessThan(2000);
  // The time axis spans the 6 hours
  await expect(streams(page)).toContainText('5:00');

  await power.locator('.recharts-surface').scrollIntoViewIfNeeded();
  const box = (await power.locator('.recharts-surface').boundingBox())!;
  const start = Date.now();
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + box.width * (0.1 + i * 0.02), box.y + box.height / 2);
  await expect(page.getByTestId('stream-readout')).toContainText(/\d+ W/);
  expect(Date.now() - start).toBeLessThan(4000);
});

test('time in zones, power curve and analysis render', async ({ page }) => {
  await page.goto(RIDE);
  for (const id of ['tiz-power', 'tiz-hr']) {
    const card = page.getByTestId(id);
    await expect(card.getByText('Z1', { exact: true })).toBeVisible();
    await expect(card.getByText(/\d+ ?%/).first()).toBeVisible();
  }
  const curve = page.getByTestId('ride-curve');
  await expect(curve.locator('.recharts-area-curve')).toBeVisible();
  await expect(curve.getByText('This ride', { exact: true })).toBeVisible();
  await expect(curve.getByText('All-time', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ride-analysis').getByText('Intensity Factor')).toBeVisible();
});

test('laps, segments and splits are sortable tables', async ({ page }) => {
  await page.goto(RIDE);
  const laps = page.getByRole('table', { name: 'Laps' });
  const segments = page.getByRole('table', { name: 'Segments' });
  const splits = page.getByRole('table', { name: 'Kilometre splits' });
  await expect(laps.locator('tbody tr')).toHaveCount(3);
  await expect(segments.locator('tbody tr')).toHaveCount(1);
  await expect(splits.locator('tbody tr')).toHaveCount(29);

  const time = splits.locator('thead th').filter({ hasText: /^Time$/ });
  await time.getByRole('button').click();
  await expect(time).toHaveAttribute('aria-sort', /ascending|descending/);
  await expect(time).toHaveCSS('text-align', 'right');
});

test('notes and raw data are kept', async ({ page }) => {
  await page.goto(RIDE);
  await page.getByText('Show raw data').click();
  await expect(page.getByTestId('ride-raw')).toContainText('"id": "demo-0149"');
});

test('previous/next navigation browses the rides in order', async ({ page }) => {
  await page.goto(RIDE);
  const name = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  await page.getByRole('link', { name: /^Older/ }).click();
  await expect(page).not.toHaveURL(new RegExp(`${RIDE}?$`));
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(name);
  await page.getByRole('link', { name: /^Newer/ }).click();
  await expect(page).toHaveURL(new RegExp(`${RIDE}?$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
});

test('the newest ride has no newer ride', async ({ page }) => {
  await page.goto('/rides/');
  const href = (await page.getByRole('table', { name: 'Ride log' }).locator('tbody tr:not([data-group])').first().getByRole('link').getAttribute('href'))!;
  await page.goto(href);
  await expect(page.getByRole('link', { name: /^Newer/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Older/ })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the ride page has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(RIDE, { waitUntil: 'networkidle' });
    await expect(streamChart(page, 'watts').locator('.recharts-surface')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
