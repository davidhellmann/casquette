// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// Refs #11: Casquette is a local tool – no npm command commits, pushes, deploys or schedules runs.
const root = path.resolve(import.meta.dirname, '..');
const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

it('exposes the manual sync entry points', () => {
  expect(scripts).toMatchObject({
    sync: 'node scripts/sync/strava-sync.ts',
    'sync:all': 'node scripts/sync/strava-sync.ts --wait',
    'sync:rebuild': 'node scripts/sync/strava-rebuild.ts',
    geo: 'node --env-file-if-exists=.env scripts/sync/geo.ts',
  });
});

it('has no npm command that publishes data or installs a scheduled sync', () => {
  const offending = Object.entries(scripts)
    .filter(([name, cmd]) => /push|deploy|schedule|publish/i.test(name) || /publish\.(m?js|ts)|schedule\.(m?js|ts)|\bgit\b/.test(cmd))
    .map(([name]) => name);
  expect(offending).toEqual([]);
});

it('ships no script that runs git', () => {
  const files = fs.readdirSync(path.join(root, 'scripts'), { recursive: true })
    .filter((f) => /\.ts$/.test(f));
  const withGit = files.filter((f) => /['"`]git['"`]/.test(fs.readFileSync(path.join(root, 'scripts', f), 'utf8')));
  expect(withGit).toEqual([]);
});
