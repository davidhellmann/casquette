// A locally installed Chromium/Chrome for headless tooling (screenshots, e2e tests),
// so no extra browser download is needed when one is already there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBrowser } from './screenshots.mjs';

/** Known install locations, most specific first: system Chromium/Chrome, then Playwright's cache (newest first). */
export function browserCandidates(home = os.homedir()) {
  const pwCache = path.join(home, 'Library', 'Caches', 'ms-playwright');
  const playwright = fs.existsSync(pwCache)
    ? fs.readdirSync(pwCache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
        .map((d) => path.join(pwCache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'))
    : [];
  return [
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...playwright,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
}

/** `CHROME_PATH` or the first installed candidate; throws if there is none. */
export const localBrowser = (env = process.env) =>
  findBrowser({ env, candidates: browserCandidates(), exists: fs.existsSync });
