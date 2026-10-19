/**
 * Shapes of the athlete-side files: the athlete file and one athlete history entry. Pure – athlete
 * storage (scripts/sync/lib/athlete-storage.ts) owns the paths and writes them; generated datasets
 * reuse the shapes.
 */

// TODO(ts-b1): use src/training type (the zone of src/training/zones.ts)
/** One zone: lower bound and upper bound (`null` = open-ended top zone). */
export type Zone = { min: number; max: number | null };

/** Today's zones in the athlete file: FTP, HR zones and where they come from, power zones. */
export type AthleteZones = {
  ftp: number | null;
  heart_rate_zones: readonly Zone[];
  heart_rate_zone_source: 'Manual' | 'Strava' | 'Default';
  power_zones: readonly Zone[] | null;
};

/** The athlete's profile in the athlete file (weight and FTP already resolved). */
export type AthleteProfile = {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  sex?: string | null;
  weight: number | null;
  ftp: number | null;
  premium: boolean;
  created_at?: string | null;
  avatar: string | null;
};

export type GearType = 'bike' | 'shoe';

/** One bike or pair of shoes: in the athlete file, the gear cache and the gear files. */
export type Gear = {
  id: string;
  name?: string | null;
  type: GearType;
  brand?: string | null;
  model?: string | null;
  frame_type?: string | null;
  description?: string | null;
  distance?: number;
  retired?: boolean;
  primary?: boolean;
  weight?: number | null;
};

/** The athlete file. */
export type AthleteFile = {
  synced_at: string;
  profile: AthleteProfile;
  zones: AthleteZones;
  gear: Gear[];
  /** Strava's athlete stats, passed through unread. */
  stats: unknown;
  sync: { list_complete: boolean; oldest: string | null };
};

export type AthleteFileInput = {
  syncedAt: string;
  profile: AthleteProfile;
  zones: AthleteZones;
  gear: Gear[];
  stats?: unknown;
  listComplete: boolean;
  oldest?: string | null;
};

/** One entry of the athlete history. */
export type HistoryEntry = {
  id: string;
  date: string;
  ftp: number | null;
  weight: number | null;
  source: string;
  note?: string;
};

/** The athlete file: profile, today's zones, gear, Strava stats and how far the list sync got. */
export function athleteFile({ syncedAt, profile, zones, gear, stats = null, listComplete, oldest }: AthleteFileInput): AthleteFile {
  return { synced_at: syncedAt, profile, zones, gear, stats, sync: { list_complete: !!listComplete, oldest: oldest ?? null } };
}

/** One entry of the athlete history; `day` is a calendar day. */
export function historyEntry({ day, ftp, weight, source, note }: { day: string; ftp: number | null; weight: number | null; source: string; note?: string }): HistoryEntry {
  return { id: day, date: day, ftp, weight, source, note };
}
