#!/usr/bin/env node
/** Strava → Astro. --rebuild is offline, before auth or environment loading. */
import { loadEnv, log } from './lib/env.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  if (flag('--rebuild')) {
    const { rebuild } = await import('./lib/rebuild.mjs');
    log(`✅ ${rebuild()} Markdown files rewritten offline.`);
    return;
  }
  loadEnv();
  const { get, usage, DailyLimitError } = await import('./lib/strava.mjs');
  const kinds = [flag('--backfill-power') && 'power', flag('--backfill-hr') && 'hr'].filter(Boolean);
  if (kinds.length) {
    const { runBackfill } = await import('./lib/backfill.mjs');
    const result = await runBackfill({
      get, DailyLimitError, wait: flag('--wait'), kinds,
      limit: Number((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 0,
    });
    if (result.failed.length) process.exitCode = 1;
    return;
  }
  const { geocodeRides } = await import('./lib/geo.mjs');
  const { runSync } = await import('./lib/sync.mjs');
  await runSync({
    get, usage, DailyLimitError, geocodeRides,
    options: {
      wait: flag('--wait'), noDetail: flag('--no-detail'), noStreams: flag('--no-streams'), noGeo: flag('--no-geo'),
      limit: Number((argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || 0,
      geoBudgetMin: process.env.GEO_BUDGET_MIN ?? 15,
    },
    fallback: { weight: process.env.WEIGHT, ftp: process.env.FTP },
  });
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
