#!/usr/bin/env node
/** Strava → Astro. `--rebuild` is an alias of `npm run sync:rebuild`: offline, before auth or environment loading. */
import { errorMessage, loadEnv } from '../shared/env.ts';

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f: string) => argv.includes(f);
  if (flag('--rebuild')) {
    await import('./strava-rebuild.ts');
    return;
  }
  loadEnv();
  const limit = Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0;
  const { createStravaClient } = await import('./lib/strava.ts');
  const strava = createStravaClient();
  const kinds = [flag('--backfill-power') && 'power' as const, flag('--backfill-hr') && 'hr' as const].filter((k) => k !== false);
  if (kinds.length) {
    const { runBackfill } = await import('./lib/backfill.ts');
    const result = await runBackfill({ strava, wait: flag('--wait'), kinds, limit });
    if (result.failed.length) process.exitCode = 1;
    return;
  }
  const { geocodeRides } = await import('./lib/geo.ts');
  const { runSync } = await import('./lib/sync.ts');
  await runSync({
    strava, geocodeRides,
    options: {
      wait: flag('--wait'), noDetail: flag('--no-detail'), noStreams: flag('--no-streams'), noGeo: flag('--no-geo'),
      limit, geoBudgetMin: process.env.GEO_BUDGET_MIN,
    },
    fallback: { weight: process.env.WEIGHT, ftp: process.env.FTP },
  });
}
main().catch((e: unknown) => { console.error('❌', errorMessage(e)); process.exit(1); });
