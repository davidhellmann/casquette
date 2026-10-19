import { ROOT, errorMessage, log } from '../../shared/env.ts';
import { createRideStorage } from './ride-storage.ts';
import type { DistributionFields, RideRecord } from './ride-storage.ts';
import type { StravaClient, StravaStreams } from './strava.ts';
import type { Distribution } from '../../shared/metrics.ts';
import { hrDistribution, powerDistribution } from '../../../src/ride/distribution.ts';

/** Which distributions a backfill adds. */
export type BackfillKind = 'power' | 'hr';

type KindSpec = {
  stream: 'watts' | 'heartrate';
  field: keyof DistributionFields;
  legacy: 'time_in_power_zones' | 'time_in_hr_zones';
  label: string;
  distribution: (time: number[] | undefined, values: (number | null)[] | undefined) => Distribution | null;
};

/** What each backfill kind needs from Strava and which stored time in zones it replaces. */
const KINDS: Record<BackfillKind, KindSpec> = {
  power: { stream: 'watts', field: 'power_distribution', legacy: 'time_in_power_zones', label: 'power', distribution: powerDistribution },
  hr: { stream: 'heartrate', field: 'hr_distribution', legacy: 'time_in_hr_zones', label: 'HR', distribution: hrDistribution },
};

/** Outcome of a backfill run: ride ids without usable samples or with errors, and whether the daily limit stopped it. */
export type BackfillResult = { total: number; saved: number; unavailable: string[]; failed: string[]; remaining: number; stopped: boolean };

/**
 * Re-fetches streams for rides that only have stored time in zones, so they gain a power and/or HR
 * distribution. One request per ride covers all kinds it needs. Uses the normal API adapter and ride
 * storage; each saved ride is a checkpoint.
 */
export async function runBackfill({ root = ROOT, strava, wait = false, limit = 0, kinds = ['power'] }:
  { root?: string; strava: StravaClient; wait?: boolean; limit?: number; kinds?: BackfillKind[] }): Promise<BackfillResult> {
  const storage = createRideStorage({ root });
  const wanted = kinds.map((k) => KINDS[k]);
  const missing = (rec: RideRecord) => wanted.filter((k) => rec.metrics?.[k.legacy] && !rec.metrics[k.field]);
  const todo = storage.list().filter((r) => missing(r).length);
  const what = wanted.map((k) => k.label).join(' and ');
  const result: BackfillResult = { total: todo.length, saved: 0, unavailable: [], failed: [], remaining: todo.length, stopped: false };
  log(`Backfill: ${todo.length} rides without a ${what} distribution.`);
  let attempted = 0;
  for (const rec of todo) {
    if (limit && attempted >= limit) break;
    attempted++;
    const needed = missing(rec);
    try {
      const keys = ['time', ...needed.map((k) => k.stream)].join(',');
      const streams = (await strava.get(`/activities/${rec.id}/streams`, { keys, key_by_type: true }, { wait })) as StravaStreams | null;
      const found: DistributionFields = {};
      for (const k of needed) {
        const distribution = k.distribution(streams?.time?.data, streams?.[k.stream]?.data);
        if (distribution) found[k.field] = distribution;
      }
      if (!Object.keys(found).length) {
        result.unavailable.push(rec.id);
        log(`⚠️  Ride ${rec.id}: no usable ${needed.map((k) => k.label).join('/')} samples; stored time in zones kept.`);
        continue;
      }
      storage.saveDistributions(rec.id, found);
      result.saved++;
      if (result.saved % 10 === 0) log(`  … ${result.saved}/${todo.length} rides backfilled.`);
    } catch (error) {
      if (strava.isDailyLimit(error)) { result.stopped = true; break; }
      result.failed.push(rec.id);
      log(`⚠️  Ride ${rec.id}: ${errorMessage(error)}`);
      // Auth/API failures must not fan out into hundreds of identical requests.
      break;
    }
  }
  result.remaining = result.total - result.saved;
  log(`Backfill: ${result.saved} added, ${result.unavailable.length} without samples, ${result.failed.length} errors, ${result.remaining} pending.`);
  return result;
}
