import { expect, test } from './fixtures';

// The demo ships demo/data/zones.json: dated HR zones (lower bounds 0/124/142/156/168 bpm until the
// end of 2024, Strava's 0/129/147/161/173 bpm after that, dates moved by the demo clock), no custom
// power bounds – so power zones stay Coggan.
const OLD_RIDE = '/rides/demo-0014/'; // early 2024
const NEW_RIDE = '/rides/demo-0149/'; // autumn 2025

test('the zones card shows where the power and HR zones come from', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId('zones-card');
  await expect(card).toContainText(/FTP \d+ W · Coggan zones/);
  await card.getByRole('radio', { name: 'HR' }).click();
  await expect(card).toContainText('HR zones from your zones file');
  await expect(card).toContainText('129–146 bpm');
});

test('a ride page shows HR time in zones with the HR zones valid on the ride date', async ({ page }) => {
  for (const [url, z2] of [[OLD_RIDE, '124–141 bpm'], [NEW_RIDE, '129–146 bpm']]) {
    await page.goto(url);
    const card = page.getByTestId('tiz-hr');
    await expect(card).toContainText('HR zones on ride date');
    await expect(card).toContainText(z2);
  }
});
