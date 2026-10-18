import { expect, test } from './fixtures';
import { DEMO_MARKER, heroRide, readDemoDataset, reviewYear } from '../scripts/site/lib/demo-dataset.ts';
import { SHOTS, planShots } from '../scripts/site/lib/screenshots.ts';

// #41: the README screenshot list (`npm run screenshots`) still matches the markup – every page
// exists, carries the demo indicator the script's privacy guard needs, and every close-up hook renders.
const { rides } = readDemoDataset({ today: new Date() });
const plan = planShots({ baseUrl: '', ride: heroRide(rides), year: reviewYear(rides), shots: SHOTS, themes: ['light'] });

for (const shot of plan) {
  test(`screenshot ${shot.file.replace('-light.webp', '')} can be framed`, async ({ page }) => {
    const res = await page.goto(shot.url);
    expect(res?.status()).toBe(200);
    await expect(page.locator(`[${DEMO_MARKER}]`)).toHaveCount(1);
    // The script hides the indicator's whole sidebar item with this selector
    await expect(page.locator(`[data-sidebar=menu-item]:has([${DEMO_MARKER}])`)).toHaveCount(1);
    if (shot.focus) await expect(page.locator(shot.focus)).toBeVisible();
  });
}
