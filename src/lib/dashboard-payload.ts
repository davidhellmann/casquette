/**
 * Dashboard payload: the one seam between the build and the dashboard / ride log islands – the JSON
 * in `#dash-data`. `encodeDashboard` (build side) and `decodeDashboard` (island side) are each other's
 * inverse for every field the islands read, so the round trip is lossless by construction.
 * Pure: no I/O, no DOM (the build pages load the data, use-dashboard.ts reads the element).
 * Contract: docs/ride.md "Dashboard and goals".
 */
import { calendarDate } from '../training/index.ts';
import type { AthleteState } from '../training/index.ts';
import type { RideClassification, Ride, TizBasis } from '../ride/index.ts';
import type { Goal } from '../scripts/goals.ts';
import type { DashboardPeriod } from '../dashboard-period/index.ts';
import type { AthleteGear, DatasetAthlete } from './build-dataset.ts';

/** Ride fields the islands read – no renaming, no domain calculation. */
const FIELDS = ['id', 'name', 'sport_type', 'start_local', 'start', 'indoor', 'stats', 'gear_id',
  'distance', 'moving_time', 'elev', 'speed', 're', 'kcal', 'pr', 'ach',
  'w', 'avg_wkg', 'np', 'hr', 'hr_max', 'cad', 'ftp', 'kg', 'if_', 'tss', 'ef', 'load',
  'best', 'tizP', 'tizH', 'dec'] as const;
type Field = (typeof FIELDS)[number];

/** A final ride as the build encodes it (ride module output). */
export type DashboardSourceRide = Pick<Ride, Field | 'clsP' | 'clsH' | 'geo' | 'tizBasis' | 'streams'>;

/**
 * A ride as the islands get it from `decodeDashboard`: the ride module's fields (same nullability),
 * `h` and `d` restored, place names only, the TIZ basis only for the bases with TIZ, and `kg` only for
 * rides with a power curve (else null). Assignable to the dashboard period's `PeriodRide`.
 */
export interface DashboardRide extends Pick<Ride, Exclude<Field, 'kg'> | 'clsP' | 'clsH' | 'h' | 'd'> {
  /** Body weight on the ride date; only sent for rides with a power curve. */
  kg: number | null;
  geo?: { places: { name: string }[] };
  tizBasis?: Partial<TizBasis>;
}

/** A ride in `#dash-data`: unknown values and transport defaults left out. */
type WireRide = Partial<Pick<DashboardRide, Field | 'geo' | 'tizBasis'>> & { clsP?: RideClassification; clsH?: RideClassification };

/** The athlete in `#dash-data`: display data, gear and today's athlete state. */
export interface DashboardAthlete extends Partial<Pick<DatasetAthlete, 'profile' | 'gear' | 'synced_at' | 'sync'>> {
  /** Today's athlete state (always sent by the build pages; missing only in an empty payload). */
  athleteState?: AthleteState | null;
}

/** Build-side input of `encodeDashboard`. */
export interface DashboardInput {
  rides: readonly DashboardSourceRide[];
  athlete?: Partial<Pick<DatasetAthlete, 'profile' | 'gear' | 'synced_at' | 'sync'>>;
  athleteState?: AthleteState | null;
  goals?: readonly Goal[];
}

/** The dashboard period (`D`) the islands compute over the decoded rides and the athlete's gear. */
export type DecodedPeriod = DashboardPeriod<DashboardRide, AthleteGear>;

/** Island-side result of `decodeDashboard`. */
export interface DashboardSource {
  athlete: DashboardAthlete;
  goals: Goal[];
  streamsCount: number;
  /** Newest first. */
  rides: DashboardRide[];
}

/** Transport defaults: left out when encoding, restored when decoding. Unknown (null) stays distinct from 0. */
// (`Object.fromEntries` loses the keys: every field is in FIELDS)
const DEFAULTS: Record<Field, unknown> = { ...Object.fromEntries(FIELDS.map((key) => [key, null])) as Record<Field, null>,
  stats: true, indoor: false, pr: 0, ach: 0, sport_type: 'Ride' };
const UNCLASSIFIED: RideClassification = { zone: null, source: 'none' };
/** Just the codes of a classification (zone and source). */
const cls = (c: RideClassification): RideClassification =>
  (c.source === 'none' ? { zone: c.zone, source: c.source } : { zone: c.zone, source: c.source });
const sameCls = (a: RideClassification, b: RideClassification) => a.zone === b.zone && a.source === b.source;

function encodeRide(ride: DashboardSourceRide): WireRide {
  return {
    // `kg` only matters for W/kg of power-curve bests
    ...Object.fromEntries(FIELDS.filter((key) => ride[key] != null && ride[key] !== DEFAULTS[key] && (key !== 'kg' || ride.best)).map((key) => [key, ride[key]])),
    // Classifications as codes; the exact default is left out, an identical HR one sent once
    ...(sameCls(ride.clsP, UNCLASSIFIED) ? {} : { clsP: cls(ride.clsP) }),
    ...(sameCls(ride.clsH, ride.clsP) ? {} : { clsH: cls(ride.clsH) }),
    // Place names only (search, ride lists) – no coordinates
    ...(ride.geo ? { geo: { places: ride.geo.places.map(({ name }) => ({ name })) } } : {}),
    // TIZ basis only for the histograms that exist
    ...(ride.tizP || ride.tizH ? { tizBasis: Object.fromEntries(Object.entries(ride.tizBasis).filter(([key]) => (key === 'power' ? ride.tizP : ride.tizH))) } : {}),
  };
}

/** Defaults back, `h` from seconds (unit conversion only), `d` from the local start; IF/TSS/EF/load/zones are not recomputed. */
function decodeRide(ride: WireRide): DashboardRide {
  const clsP = cls(ride.clsP ?? UNCLASSIFIED);
  // Codec seam: every field left out by encodeRide is restored from DEFAULTS, so the result has the
  // fields (and nullability) of DashboardRide – the round trip tests check this.
  return { ...DEFAULTS, ...ride, h: (ride.moving_time || 0) / 3600, clsP, clsH: cls(ride.clsH ?? clsP), d: calendarDate(ride.start_local) } as DashboardRide;
}

/**
 * Build side: final rides (from the ride module), the athlete, today's athlete state and the goals →
 * the JSON text for `#dash-data`, with `<` escaped so it can never close the script element.
 */
export function encodeDashboard({ rides, athlete = {}, athleteState = null, goals = [] }: DashboardInput): string {
  const payload = {
    athlete: { profile: athlete.profile, athleteState, gear: athlete.gear, synced_at: athlete.synced_at, sync: athlete.sync },
    rides: rides.map(encodeRide),
    streamsCount: rides.filter((r) => r.streams).length,
    goals,
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

/**
 * Island side: the JSON text of `#dash-data` → `{ athlete, goals, streamsCount, rides }` with
 * final, flat rides as the dashboard period expects them (newest first, rides without a valid
 * local start dropped).
 */
export function decodeDashboard(text: string): DashboardSource {
  // Parse seam: the text is what encodeDashboard wrote.
  const raw: { athlete?: DashboardAthlete; goals?: Goal[]; streamsCount?: number; rides?: WireRide[] } = JSON.parse(text || '{}');
  return {
    athlete: raw.athlete || {},
    goals: raw.goals || [],
    streamsCount: raw.streamsCount || 0,
    rides: (raw.rides || []).map(decodeRide).filter((r) => !isNaN(+r.d)).sort((a, b) => +b.d - +a.d),
  };
}
