/**
 * Build dataset (GLOSSARY): everything one build shows, read once from one data source at one build
 * clock. Pages and payload builders ask the dataset; none of them reads files, Astro collections or
 * the clock themselves.
 *
 * The data source is an adapter: `fileSource()` in data.ts reads the synced or the demo data
 * (fs + astro:content), `memorySource()` below serves tests. The clock (`now`) is passed in once.
 * Behind the interface: data source choice, demo date shift, the athlete timeline, the ride module
 * for every ride, gear totals, W/kg of power-curve bests and the build calendar.
 */
import type { z } from 'astro/zod';
import { athleteTimeline, rideCalendar, startOfDay } from '../training/index.ts';
import type { AthleteData, AthleteHistoryEntry, AthleteState, BestCurve, DatedHistoryEntry } from '../training/index.ts';
import { processRide } from '../ride/index.ts';
import type { Ride } from '../ride/index.ts';
import { gearSchema, rideSchema } from '../content-schemas.ts';
import type { GearCustom, GearEntry, RideEntry } from '../content-schemas.ts';
import type { Goal } from '../scripts/goals.ts';
import type { ChartStreams } from './chart-streams.ts';
import { demoDayShift, shiftHistory, shiftInstant, shiftRideDates, shiftZonesFile } from './demo-clock.ts';

/** A content collection entry: the frontmatter in `data`, the Markdown body in `body`. */
export interface SourceEntry<T> {
  id: string;
  data: T;
  body?: string;
}

/** The entry types of a data source per collection; the file source serves Astro's collection entries. */
export interface SourceEntries {
  rides: SourceEntry<RideEntry>;
  gear: SourceEntry<GearEntry>;
}

/** Sync status in the athlete file: whether the activity list is complete and the oldest synced ride. */
export interface AthleteSync {
  list_complete?: boolean | null;
  oldest?: string | null;
}

/** A bike or pair of shoes as the athlete file lists it (scripts/shared/athlete-file.ts). */
export interface AthleteGear {
  id: string;
  /** Strava's gear name (Strava always sends one; a gear file defaults to 'Gear'). */
  name: string;
  type?: 'bike' | 'shoe' | null;
  brand?: string | null;
  model?: string | null;
  frame_type?: string | null;
  description?: string | null;
  /** Strava's distance in metres. */
  distance?: number | null;
  retired?: boolean | null;
  primary?: boolean | null;
  /** Weight in kg. */
  weight?: number | null;
}

/** The athlete's profile in the athlete file (the build reads only these fields). */
export interface AthleteProfile {
  first_name?: string | null;
  last_name?: string | null;
  ftp?: number | null;
  weight?: number | null;
}

/** athlete.json as the build reads it ({} without one); the athlete state reads FTP, weight and zones from it. */
export interface AthleteSource extends AthleteData {
  synced_at?: string | null;
  profile?: AthleteProfile | null;
  gear?: AthleteGear[] | null;
  sync?: AthleteSync | null;
}

/**
 * The athlete for display (name, gear, sync status); FTP, body weight and zones only via the athlete
 * state (`athleteAt`). Fields of athlete.json the build does not read pass through untyped.
 */
export interface DatasetAthlete {
  /** Last sync (ISO instant); demo: moved with the demo dates, never later than now. */
  synced_at: string | null | undefined;
  /** Name only – weight and FTP are left out. */
  profile: { first_name: string | null; last_name: string | null };
  gear: AthleteGear[];
  sync?: AthleteSync | null;
}

/** Demo meta.json: the day of the newest demo ride decides the demo date shift. */
export interface DemoMeta {
  newest_day?: string | null;
}

/** Where the build data comes from (an adapter: `fileSource()` in data.ts, `memorySource()` below). */
export interface DataSource<E extends SourceEntries = SourceEntries> {
  /** True while the demo data is active. */
  demo: boolean;
  /** athlete.json ({} without one). */
  athlete(): AthleteSource;
  /** Athlete history (fitness-history.json, else its example). */
  history(): AthleteHistoryEntry[];
  /** zones.json, parsed but unchecked (null without one; a broken file throws). */
  zonesFile(): unknown;
  /** goals.json, else its example. */
  goals(): Goal[];
  /** Demo meta.json ({} without one). */
  meta(): DemoMeta;
  rides(): Promise<E['rides'][]>;
  gear(): Promise<E['gear'][]>;
  /** A ride's chart streams, null without them. */
  streams(id: string): ChartStreams | null;
  /** Ids of the rides with a chart streams file. */
  streamIds(): string[];
}

/** Totals of a set of rides (km, hours, metres, kJ, kcal …). */
export interface RideTotals {
  n: number;
  km: number;
  h: number;
  elev: number;
  kj: number;
  kcal: number;
  tss: number;
  pr: number;
  ach: number;
  kudos: number;
  /** Indoor hours. */
  indoorH: number;
}

/** What `totals` reads of a ride. */
export type TotalsRide = Pick<Ride, 'distance' | 'h' | 'elev' | 'kj' | 'kcal' | 'tss' | 'pr' | 'ach' | 'kudos' | 'indoor'>;

/** Gear with its admitted stat rides and totals (`data.gear`). */
export interface DatasetGear extends Omit<AthleteGear, 'type'> {
  type: 'bike' | 'shoe';
  /** The rider's own data from the gear file. */
  custom?: GearCustom | null;
  /** Admitted stat rides on this gear, newest first. */
  rides: Ride[];
  t: RideTotals;
  first: Ride | null;
  last: Ride | null;
  /** Kilometres of the admitted stat rides. */
  kmTotal: number;
  /** Strava's kilometres (every ride, e-bike rides included). */
  stravaKm: number;
  /** Purchase price per stat ride kilometre; null without a price or kilometres. */
  costPerKm: number | null;
}

/**
 * The build calendar (GLOSSARY): the build clock, today, the calendar end and the admitted rides
 * (actual start not in the future, newest first) with their stat rides.
 */
export interface BuildCalendar {
  now: Date;
  /** Start of today. */
  today: Date;
  /** Calendar end (local midnight). */
  end: Date;
  rides: Ride[];
  statRides: Ride[];
}

/** W/kg per point of a best curve; null when the best's ride is unknown. */
export type CurveWkg = Record<string, number | null>;

/**
 * The build dataset (GLOSSARY "Build dataset"):
 * - `demo`: the demo data is active (every page carries the demo marker)
 * - `athlete`: the athlete for display (name, gear, sync status) – FTP, body weight and zones only via `athleteAt`
 * - `history`: athlete history, ascending, each entry with `d` (Date); `goals`
 * - `athleteAt(date)`: the athlete state on a date; `athleteToday`: today's athlete state
 * - `rides`: every ride (ride module output), newest first – ride pages, map and the dashboard payload
 *   (the browser admits rides by its own clock)
 * - `calendar`: the build calendar; every build view that counts rides uses it
 * - `gear`: gear with its admitted stat rides, totals, first/last ride and cost per km
 * - `curveWkg(best)`: W/kg per point of a best curve, with the body weight on the date of each best's ride
 * - `entry(collection, id)`: the raw content entry of a ride or gear (Markdown body, raw frontmatter)
 * - `streams(id)`: a ride's chart streams; `streamIds()`: the demo rides with chart streams (none with real
 *   data – those are served from public/streams)
 */
export interface BuildDataset<E extends SourceEntries = SourceEntries> {
  demo: boolean;
  athlete: DatasetAthlete;
  history: DatedHistoryEntry[];
  goals: Goal[];
  athleteAt(date: Date | string): AthleteState;
  athleteToday: AthleteState;
  rides: Ride[];
  calendar: BuildCalendar;
  gear: DatasetGear[];
  curveWkg(best: BestCurve): CurveWkg;
  entry<C extends keyof SourceEntries>(collection: C, id: string | number): E[C] | null;
  streams(id: string | number): ChartStreams | null;
  streamIds(): string[];
}

/** Totals of a set of rides: count, km, hours, elevation, energy, TSS, PRs, achievements, kudos, indoor hours. */
export function totals(rides: readonly TotalsRide[]): RideTotals {
  const t: RideTotals = { n: rides.length, km: 0, h: 0, elev: 0, kj: 0, kcal: 0, tss: 0, pr: 0, ach: 0, kudos: 0, indoorH: 0 };
  for (const r of rides) {
    t.km += r.distance / 1000; t.h += r.h; t.elev += r.elev; t.kj += r.kj || 0; t.kcal += r.kcal || 0; t.tss += r.tss || 0;
    t.pr += r.pr; t.ach += r.ach; t.kudos += r.kudos; if (r.indoor) t.indoorH += r.h;
  }
  return t;
}

/** A gear file's frontmatter or an athlete gear entry, before the totals. */
type SourceGear = AthleteGear & { custom?: GearCustom | null };

/** Gear entries + the athlete's gear list → gear with its stat rides and totals, active and most used first. */
function gearWithTotals(entries: readonly SourceEntry<GearEntry>[], athleteGear: readonly AthleteGear[], statRides: readonly Ride[]): DatasetGear[] {
  const byId = new Map<string, SourceGear>(entries.map((e) => [String(e.data.id), { ...e.data, id: String(e.data.id) }]));
  for (const g of athleteGear) if (!byId.has(String(g.id))) byId.set(String(g.id), { ...g, id: String(g.id) });
  return Array.from(byId.values()).map((g): DatasetGear => {
    const rides = statRides.filter((r) => r.gear_id === g.id);
    const t = totals(rides);
    const price = g.custom && g.custom.price_eur;
    return {
      ...g, type: g.type || (String(g.id).startsWith('b') ? 'bike' : 'shoe'), rides, t,
      first: rides[rides.length - 1] || null, last: rides[0] || null,
      kmTotal: t.km, stravaKm: (g.distance || 0) / 1000, costPerKm: price && t.km ? price / t.km : null,
    };
  }).sort((a, b) => Number(!!a.retired) - Number(!!b.retired) || b.kmTotal - a.kmTotal);
}

/**
 * `source`: the data source adapter; `now`: the build clock – the instant the build runs at.
 * Returns the build dataset (`BuildDataset` above).
 */
export async function createBuildDataset<E extends SourceEntries>(source: DataSource<E>, { now }: { now: Date }): Promise<BuildDataset<E>> {
  const demo = !!source.demo;
  // Demo dates move forward in whole weeks so the newest demo ride is always recent; real data: 0.
  const shift = demo ? demoDayShift(source.meta()?.newest_day, now) : 0;

  const raw = source.athlete() || {};
  const { zones: _zones, ...rest } = raw;
  const { weight: _weight, ftp: _ftp, ...profile } = rest.profile || {};
  const athlete: DatasetAthlete = {
    ...rest,
    synced_at: demo ? shiftInstant(rest.synced_at, shift, +now) : rest.synced_at,
    profile: { first_name: '', last_name: '', ...profile },
    gear: rest.gear || [],
  };
  const timeline = athleteTimeline({
    athlete: raw,
    history: shiftHistory(source.history(), shift),
    zonesFile: shiftZonesFile(source.zonesFile(), shift),
  });
  const athleteAt = (date: Date | string) => timeline.at(date);

  const rideEntries = await source.rides();
  const rideById = new Map(rideEntries.map((e) => [String(e.data.id), e]));
  const rides = rideEntries
    .map((e) => {
      const ride = shiftRideDates(e.data, shift);
      return processRide(ride, athleteAt(ride.start_date_local));
    })
    .filter((r) => !isNaN(+r.d))
    .sort((a, b) => +b.d - +a.d);

  const { available, end } = rideCalendar(rides, now);
  const calendar: BuildCalendar = { now: new Date(now), today: startOfDay(now), end, rides: available, statRides: available.filter((r) => r.stats) };

  const gearEntries = await source.gear();
  const gearById = new Map(gearEntries.map((e) => [String(e.data.id), e]));
  const entries: { [C in keyof SourceEntries]: Map<string, E[C]> } = { rides: rideById, gear: gearById };
  const gear = gearWithTotals(gearEntries, athlete.gear, calendar.statRides);

  const byId = new Map(rides.map((r) => [r.id, r]));
  return {
    demo,
    athlete,
    history: timeline.history,
    goals: source.goals(),
    athleteAt,
    athleteToday: athleteAt(now),
    rides,
    calendar,
    gear,
    curveWkg: (best) => Object.fromEntries(Object.entries(best).map(([k, v]) => {
      const ride = byId.get(String(v.id));
      return [k, ride ? +(v.w / ride.kg).toFixed(2) : null];
    })),
    entry: (collection, id) => entries[collection]?.get(String(id)) ?? null,
    streams: (id) => source.streams(String(id)),
    streamIds: () => (demo ? source.streamIds() : []),
  };
}

/** Input of the in-memory data source: the same shapes as the files, before the content schemas. */
export interface MemorySourceInput {
  demo?: boolean;
  athlete?: AthleteSource;
  history?: AthleteHistoryEntry[];
  zonesFile?: unknown;
  goals?: Goal[];
  meta?: DemoMeta;
  /** Ride frontmatter objects. */
  rides?: z.input<typeof rideSchema>[];
  /** Gear frontmatter objects. */
  gear?: z.input<typeof gearSchema>[];
  /** Chart streams by ride id. */
  streams?: Record<string, ChartStreams>;
}

/**
 * In-memory data source (tests): the same shapes as the files, validated with the content schemas like
 * the collections are. `rides` and `gear` are frontmatter objects, `streams` maps ride ids to chart streams.
 */
export function memorySource(
  { demo = false, athlete = {}, history = [], zonesFile = null, goals = [], meta = {}, rides = [], gear = [], streams = {} }: MemorySourceInput = {},
): DataSource {
  const entry = <T extends { id: string }>(schema: { parse(data: unknown): T }) => (data: unknown): SourceEntry<T> => {
    const parsed = schema.parse(data);
    return { id: parsed.id, data: parsed, body: '' };
  };
  return {
    demo,
    athlete: () => athlete,
    history: () => history,
    zonesFile: () => zonesFile,
    goals: () => goals,
    meta: () => meta,
    rides: async () => rides.map(entry(rideSchema)),
    gear: async () => gear.map(entry(gearSchema)),
    streams: (id) => streams[id] ?? null,
    streamIds: () => Object.keys(streams),
  };
}
