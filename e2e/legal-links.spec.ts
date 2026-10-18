import { expect, test } from './fixtures';

// Refs #55: the e2e build has no PUBLIC_LEGAL_URL – like every self-hosted copy, the sidebar shows
// no legal links. The case with the variable (the hosted demo): src/components/app/legal-footer.test.ts.
test('no legal links in the sidebar without PUBLIC_LEGAL_URL', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('[data-slot="sidebar"]');
  await expect(sidebar.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.locator('[data-legal-links]')).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /legal notice|privacy policy/i })).toHaveCount(0);
});
