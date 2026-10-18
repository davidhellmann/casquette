/**
 * Build dataset (GLOSSARY): everything one build shows, read once from one data source at one build
 * clock. Pages and payload builders ask the dataset; none of them reads files, Astro collections or
 * the clock themselves.
 *
 * The data source is an adapter: `fileSource()` in data.js reads the synced or the demo data
 * (fs + astro:content), `memorySource()` below serves tests. The clock (`now`) is passed in once.
 * Behind the interface: data source choice, demo date shift, the athlete timeline, the ride module
 * for every ride, gear totals, W/kg of power-curve bests and the build calendar.
 */
import { athleteTimeline, rideCalendar, startOfDay } from '../training/index.js';
import { processRide } from '../ride/index.js';
import { gearSchema, rideSchema } from '../content-schemas.js';
import { demoDayShift, shiftHistory, shiftInstant, shiftRideDates, shiftZonesFile } from './demo-clock.js';

/**
 * @typedef {{ id: string, data: object, body?: string }} SourceEntry  a content collection entry (frontmatter in `data`)
 * @typedef {object} DataSource  where the build data comes from
 * @property {boolean} demo  true while the demo data is active
 * @property {() => object} athlete  athlete.json ({} without one)
 * @property {() => object[]} history  athlete history (fitness-history.json, else its example)
 * @property {() => object|null} zonesFile  zones.json (null without one; a broken file throws)
 * @property {() => object[]} goals  goals.json, else its example
 * @property {() => object} meta  demo meta.json ({} without one)
 * @property {() => Promise<SourceEntry[]>} rides  ride entries
 * @property {() => Promise<SourceEntry[]>} gear  gear entries
 * @property {(id: string) => object|null} streams  a ride's chart streams, null without them
 * @property {() => string[]} streamIds  ids of the rides with a chart streams file
 */

/** Totals of a set of rides: count, km, hours, elevation, energy, TSS, PRs, achievements, kudos, indoor hours. */
export function totals(rides) {
  const t = { n: rides.length, km: 0, h: 0, elev: 0, kj: 0, kcal: 0, tss: 0, pr: 0, ach: 0, kudos: 0, indoorH: 0 };
  for (const r of rides) {
    t.km += r.distance / 1000; t.h += r.h; t.elev += r.elev; t.kj += r.kj || 0; t.kcal += r.kcal || 0; t.tss += r.tss || 0;
    t.pr += r.pr; t.ach += r.ach; t.kudos += r.kudos; if (r.indoor) t.indoorH += r.h;
  }
  return t;
}

/** Gear entries + the athlete's gear list → gear with its stat rides and totals, active and most used first. */
function gearWithTotals(entries, athleteGear, statRides) {
  const byId = new Map(entries.map((e) => [String(e.data.id), { ...e.data, id: String(e.data.id) }]));
  for (const g of athleteGear) if (!byId.has(String(g.id))) byId.set(String(g.id), { ...g, id: String(g.id) });
  return Array.from(byId.values()).map((g) => {
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
 * @param {DataSource} source  the data source adapter
 * @param {{ now: Date }} clock  the build clock: the instant the build runs at
 *
 * The build dataset (type BuildDataset):
 * - `demo`: the demo data is active (every page carries the demo marker)
 * - `athlete`: the athlete for display (name, gear, sync status) – FTP, body weight and zones only via `athleteAt`
 * - `history`: athlete history, ascending, each entry with `d` (Date); `goals`
 * - `athleteAt(date)`: the athlete state on a date; `athleteToday`: today's athlete state
 * - `rides`: every ride (ride module output), newest first – ride pages, map and the dashboard payload
 *   (the browser admits rides by its own clock)
 * - `calendar`: the build calendar – `now`, `today` (start of today), `end` (calendar end), `rides` (admitted:
 *   actual start not in the future, newest first) and `statRides` (their stat rides); every build view that
 *   counts rides uses these
 * - `gear`: gear with its admitted stat rides, totals, first/last ride and cost per km
 * - `curveWkg(best)`: W/kg per point of a best curve, with the body weight on the date of each best's ride
 * - `entry(collection, id)`: the raw content entry of a ride or gear (Markdown body, raw frontmatter)
 * - `streams(id)`: a ride's chart streams; `streamIds()`: the demo rides with chart streams (none with real
 *   data – those are served from public/streams)
 */
export async function createBuildDataset(source, { now }) {
  const demo = !!source.demo;
  // Demo dates move forward in whole weeks so the newest demo ride is always recent; real data: 0.
  const shift = demo ? demoDayShift(source.meta()?.newest_day, now) : 0;

  const raw = source.athlete() || {};
  const { zones: _zones, ...rest } = raw;
  const { weight: _weight, ftp: _ftp, ...profile } = rest.profile || {};
  const athlete = {
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
  const athleteAt = (date) => timeline.at(date);

  const rideEntries = await source.rides();
  const entries = { rides: new Map(rideEntries.map((e) => [String(e.data.id), e])), gear: new Map() };
  const rides = rideEntries
    .map((e) => {
      const ride = shiftRideDates(e.data, shift);
      return processRide(ride, athleteAt(ride.start_date_local));
    })
    .filter((r) => !isNaN(r.d))
    .sort((a, b) => b.d - a.d);

  const { available, end } = rideCalendar(rides, now);
  const calendar = { now: new Date(now), today: startOfDay(now), end, rides: available, statRides: available.filter((r) => r.stats) };

  const gearEntries = await source.gear();
  for (const e of gearEntries) entries.gear.set(String(e.data.id), e);
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

/** @typedef {Awaited<ReturnType<typeof createBuildDataset>>} BuildDataset */

/**
 * In-memory data source (tests): the same shapes as the files, validated with the content schemas like
 * the collections are. `rides` and `gear` are frontmatter objects, `streams` maps ride ids to chart streams.
 * @returns {DataSource}
 */
export function memorySource({ demo = false, athlete = {}, history = [], zonesFile = null, goals = [], meta = {}, rides = [], gear = [], streams = {} } = {}) {
  const entry = (schema) => (data) => { const parsed = schema.parse(data); return { id: parsed.id, data: parsed, body: '' }; };
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
