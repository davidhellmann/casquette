import { createHash } from 'node:crypto';
import { defineConfig } from '@playwright/test';
import { localBrowser } from './scripts/lib/browser.mjs';

// Browser test of the promo website (website/, plain HTML/CSS/JS, no build): `npm run test:website`.
// Separate from the app e2e (playwright.config.ts): no Astro build, own port range, own folder.

// One port per checkout, in a range of its own, so it never collides with the app e2e server (WEBSITE_PORT overrides).
const PORT = Number(process.env.WEBSITE_PORT) || 4900 + (parseInt(createHash('sha1').update(process.cwd()).digest('hex').slice(0, 6), 16) % 500);
let executablePath: string | undefined;
try { executablePath = localBrowser(); } catch { executablePath = undefined; }

export default defineConfig({
  testDir: 'e2e-website',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results/website',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The website defaults to dark; the tests pick light/dark through the system (emulateMedia), so
    // every context starts on "auto". Tests of the default clear it.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'rc_site_theme', value: 'auto' }] }] },
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath },
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    env: { PORT: String(PORT), SERVE_ROOT: 'website' },
    url: `http://localhost:${PORT}/`,
    // Never reuse: another checkout's server on the same port would be tested instead of this one
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
