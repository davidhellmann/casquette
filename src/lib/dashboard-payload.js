/**
 * Dashboard payload: the one seam between the build and the dashboard / ride log islands – the JSON
 * in `#dash-data`. `encodeDashboard` (build side) and `decodeDashboard` (island side) are each other's
 * inverse for every field the islands read, so the round trip is lossless by construction.
 * Pure: no I/O, no DOM (the build pages load the data, use-dashboard.ts reads the element).
 * Contract: docs/ride.md "Dashboard and goals".
 */
import { BASE } from './routes.js';
import { calendarDate } from '../training/calendar-day.js';

/** Ride fields the islands read – no renaming, no domain calculation. */
const FIELDS = ['id', 'name', 'sport_type', 'start_local', 'start', 'indoor', 'stats', 'gear_id',
  'distance', 'moving_time', 'elev', 'speed', 're', 'kcal', 'pr', 'ach',
  'w', 'avg_wkg', 'np', 'hr', 'hr_max', 'cad', 'ftp', 'kg', 'if_', 'tss', 'ef', 'load',
  'best', 'tizP', 'tizH', 'dec'];
/** Transport defaults: left out when encoding, restored when decoding. Unknown (null) stays distinct from 0. */
const DEFAULTS = { ...Object.fromEntries(FIELDS.map((key) => [key, null])),
  stats: true, indoor: false, pr: 0, ach: 0, sport_type: 'Ride' };
const UNCLASSIFIED = { zone: null, source: 'none' };
const cls = ({ zone, source }) => ({ zone, source });
const sameCls = (a, b) => a.zone === b.zone && a.source === b.source;

function encodeRide(ride) {
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
function decodeRide(ride) {
  const clsP = cls(ride.clsP ?? UNCLASSIFIED);
  return { ...DEFAULTS, ...ride, h: (ride.moving_time || 0) / 3600, clsP, clsH: cls(ride.clsH ?? clsP), d: calendarDate(ride.start_local) };
}

/**
 * Build side: final rides (from the ride module), the athlete, today's athlete state and the goals →
 * the JSON text for `#dash-data`, with `<` escaped so it can never close the script element.
 */
export function encodeDashboard({ rides, athlete = {}, athleteState = null, goals = [], base = BASE }) {
  const payload = {
    base,
    athlete: { profile: athlete.profile, athleteState, gear: athlete.gear, synced_at: athlete.synced_at, sync: athlete.sync },
    rides: rides.map(encodeRide),
    streamsCount: rides.filter((r) => r.streams).length,
    goals,
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

/**
 * Island side: the JSON text of `#dash-data` → `{ base, athlete, goals, streamsCount, rides }` with
 * final, flat rides as the dashboard period expects them (newest first, rides without a valid
 * local start dropped).
 */
export function decodeDashboard(text) {
  const raw = JSON.parse(text || '{}');
  return {
    base: raw.base || '/',
    athlete: raw.athlete || {},
    goals: raw.goals || [],
    streamsCount: raw.streamsCount || 0,
    rides: (raw.rides || []).map(decodeRide).filter((r) => !isNaN(r.d)).sort((a, b) => b.d - a.d),
  };
}
