// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Shapes of the athlete-side files: the athlete file and one athlete history entry. Pure – athlete
 * storage (scripts/sync/lib/athlete-storage.ts) owns the paths and writes them; generated datasets
 * reuse the shapes.
 */

/** The athlete file: profile, today's zones, gear, Strava stats and how far the list sync got. */
export function athleteFile({ syncedAt, profile, zones, gear, stats = null, listComplete, oldest }) {
  return { synced_at: syncedAt, profile, zones, gear, stats, sync: { list_complete: !!listComplete, oldest: oldest ?? null } };
}

/** One entry of the athlete history; `day` is a calendar day. */
export function historyEntry({ day, ftp, weight, source, note }) {
  return { id: day, date: day, ftp, weight, source, note };
}
