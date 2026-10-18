import path from 'node:path';
import { expect, test } from './fixtures';
import { SHOTS, pickHeroRide, planShots, readDemoRides, reviewYear, rideYears } from '../scripts/lib/screenshots.mjs';

// #41: the README screenshot list (`npm run screenshots`) still matches the markup – every page
// exists, carries the demo indicator the script's privacy guard needs, and every close-up hook renders.
const rides = readDemoRides(path.resolve(import.meta.dirname, '..', 'demo', 'rides'));
const plan = planShots({ baseUrl: '', ride: pickHeroRide(rides), year: reviewYear(rideYears(rides)), shots: SHOTS, themes: ['light'] });

for (const shot of plan) {
  test(`screenshot ${shot.file.replace('-light.webp', '')} can be framed`, async ({ page }) => {
    const res = await page.goto(shot.url);
    expect(res?.status()).toBe(200);
    await expect(page.locator('[data-demo-note]')).toHaveCount(1);
    // The script hides the indicator's whole sidebar item with this selector
    await expect(page.locator('[data-sidebar=menu-item]:has([data-demo-note])')).toHaveCount(1);
    if (shot.focus) await expect(page.locator(shot.focus)).toBeVisible();
  });
}
