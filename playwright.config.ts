import { createHash } from 'node:crypto';
import { defineConfig } from '@playwright/test';
import { localBrowser } from './scripts/lib/browser.mjs';

// e2e tests run against a production build of the demo dataset (DATA_SOURCE=demo), so results
// are deterministic and never touch personal data. A locally installed Chromium/Chrome is used
// when there is one; otherwise run `npx playwright install chromium` once.

// One port per checkout, so parallel worktrees never test against each other's server (E2E_PORT overrides).
const PORT = Number(process.env.E2E_PORT) || 4400 + (parseInt(createHash('sha1').update(process.cwd()).digest('hex').slice(0, 6), 16) % 500);
let executablePath: string | undefined;
try { executablePath = localBrowser(); } catch { executablePath = undefined; }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The app defaults to light; the tests pick light/dark through the system (emulateMedia), so
    // every context starts on "auto". Tests of the default clear it.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'rc_theme', value: 'auto' }] }] },
    viewport: { width: 1440, height: 900 },
    // Transitions and enter/exit animations (tooltips, menus, sheets) collapse to ~0 ms
    // (app.css), so assertions never race a fade. Readiness: e2e/fixtures.ts.
    reducedMotion: 'reduce',
    launchOptions: { executablePath },
  },
  webServer: {
    command: `DATA_SOURCE=demo astro build --outDir dist-e2e && node e2e/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    // Never reuse: another checkout's server on the same port would be tested instead of this one
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
