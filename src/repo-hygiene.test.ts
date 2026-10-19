import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The repository is public: personal sync data, secrets and caches must never be tracked. GPS
// start and end points give away home addresses. .gitignore keeps them out; this guards against a
// forced add (`git add -f`) or a gitignore rule that gets lost. Skipped outside a git checkout
// (e.g. a ZIP download).

const ROOT = path.resolve(import.meta.dirname, '..');
let tracked: string[] = [];
let isCheckout = false;
try {
  tracked = execFileSync('git', ['ls-files', '--cached'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  isCheckout = true;
} catch { /* not a git checkout */ }

const KEEP = /(^|\/)\.gitkeep$/;
const FORBIDDEN: [RegExp, string][] = [
  [/^src\/content\/rides\//, 'synced rides'],
  [/^src\/content\/gear\//, 'synced gear'],
  [/^public\/streams\//, 'ride streams (GPS)'],
  [/^src\/data\/(?!.*\.example\.json$)[^/]+\.json$/, 'personal data files (only *.example.json)'],
  [/^\.strava-cache\//, 'the sync cache'],
  [/(^|\/)\.env(\..+)?$/, 'environment files (only .env.example)'],
  [/(^|\/)\.strava-token\.json$/, 'the Strava token'],
  [/^(dist|dist-e2e|dist-fragments|dist-site|dist-demo|test-results|playwright-report|\.scratch|\.claude)\//, 'build output and local scratch'],
];

describe.skipIf(!isCheckout)('repository hygiene', () => {
  it('tracks no personal data, secrets, caches or build output', () => {
    const hits = tracked
      .filter((file) => !KEEP.test(file) && file !== '.env.example')
      .flatMap((file) => FORBIDDEN.filter(([re]) => re.test(file)).map(([, what]) => `${file} (${what})`));
    expect(hits).toEqual([]);
  });

  it('has no JavaScript modules outside the standalone website (docs/adr/0004)', () => {
    expect(tracked.filter((file) => /\.(c|m)?jsx?$/.test(file) && !file.startsWith('website/'))).toEqual([]);
  });
});
