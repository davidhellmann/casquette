import { log, ROOT, systemClock } from './env.mjs';
import { computeMetrics, downsampleStreams } from './metrics.mjs';
import { isRide } from '../../src/training/index.js';
import { writeGear } from './gear-file.mjs';
import { athleteGear, athleteProfile, athleteZones, slimDetail, slimGear, slimSummary } from './strava.mjs';
import { createRideStorage } from './ride-storage.mjs';
import { createAthleteStorage } from './athlete-storage.mjs';

const STREAM_KEYS = 'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth';
const PAGE = 200;

/**
 * Time for looking up places at the end of a sync (0 = no limit). An explicit `GEO_BUDGET_MIN` always
 * wins; otherwise `--wait` (`npm run sync:all`, the first full sync) resolves every place, and a plain
 * sync spends at most 15 minutes.
 */
function geoBudgetMs({ wait, geoBudgetMin }) {
  const explicit = geoBudgetMin !== undefined && geoBudgetMin !== null && String(geoBudgetMin).trim() !== '';
  return (explicit ? Number(geoBudgetMin) : wait ? 0 : 15) * 60e3;
}

/**
 * The sync run: athlete → activity list → gear → athlete file and history → details and streams
 * → places. The Strava client, geocoder and clock are supplied by the entry point (tests pass fakes);
 * no environment or auth loading in this module.
 */
export async function runSync({ root = ROOT, strava, geocodeRides, clock = systemClock, options = {}, fallback = {} }) {
  const { wait = false, noDetail = false, noStreams = false, noGeo = false, limit = 0, geoBudgetMin } = options;
  const started = clock.now();
  const athleteStorage = createAthleteStorage({ root, clock });

  const athlete = await fetchAthlete(strava, fallback);
  // Even a rate-limited gear endpoint must not discard names already supplied by /athlete.
  const gear = athleteStorage.gear({ requireAthlete: false });
  athleteGear(athlete.api).forEach(gear.add);
  const storage = createRideStorage({ root, gear: gear.byId });

  const cursor = athleteStorage.listCursor();
  const listed = await fetchActivityList({ strava, storage, cursor, clock, wait });
  await refreshGear({ strava, gear, rides: [...storage.list(), ...listed.values()], athlete: athlete.api });
  const gearList = gear.save();
  gearList.forEach((g) => writeGear(g, { root, now: clock.now() }));
  // First save only after names from current list + cached rides + athlete are known.
  for (const rec of listed.values()) storage.save(rec);
  cursor.save();

  athleteStorage.writeAthlete({
    syncedAt: new Date(clock.now()).toISOString(), profile: athlete.profile, zones: athlete.zones, gear: gearList,
    stats: athlete.stats, listComplete: cursor.complete, oldest: cursor.oldest(),
  });
  const entry = athleteStorage.recordFitness({ ftp: athlete.ftp, weight: athlete.weight });
  if (entry) log(`📈 New entry in fitness-history.json: FTP ${entry.ftp} W, ${entry.weight} kg`);

  const details = await fetchDetails({ strava, storage, clock, wait, noDetail, noStreams, limit });

  if (!noGeo) {
    try {
      await geocodeRides(storage.list(), { root, budgetMs: geoBudgetMs({ wait, geoBudgetMin }), onRide: (rec) => storage.save(rec) });
    } catch (e) { log(`⚠️  Places skipped: ${e.message}`); }
  }

  const left = details.todo - details.done;
  log(`✅ Done in ${Math.round((clock.now() - started) / 1000)} s · ${strava.usage().calls} API calls · ${details.done} rides with details`);
  if (!cursor.complete || left > 0) {
    log(`ℹ️  Still pending: ${cursor.complete ? '' : 'parts of the activity list, '}${left} rides with details.` +
      (details.stopped ? ' Strava daily limit reached – just run `npm run sync` again tomorrow (or leave `npm run sync:all` running).' : ''));
  }
}

/** Athlete, today's zones and stats; weight and FTP fall back to the configured values. */
async function fetchAthlete(strava, fallback) {
  log('Fetching athlete and zones …');
  const a = await strava.get('/athlete');
  let apiZones = null, stats = null;
  try { apiZones = await strava.get('/athlete/zones'); } catch (e) { log('Zones unavailable:', e.message); }
  try { stats = await strava.get(`/athletes/${a.id}/stats`); } catch {}
  const weight = a.weight || Number(fallback.weight) || null;
  const ftp = a.ftp || Number(fallback.ftp) || null;
  return { api: a, weight, ftp, stats, zones: athleteZones(apiZones, ftp), profile: athleteProfile(a, { weight, ftp }) };
}

/** New activities since the last run, then the rest of the history (until the daily limit).
 * Returns the listed rides as records, not saved yet. */
async function fetchActivityList({ strava, storage, cursor, clock, wait }) {
  const listed = new Map();
  let added = 0, updated = 0;
  const upsert = (a) => {
    cursor.seen(a);
    if (!isRide(a.sport_type || a.type)) return;
    const rec = listed.get(String(a.id)) || storage.read(String(a.id)) || { id: String(a.id), _sync: {} };
    rec._sync ||= {};
    if (rec.summary) updated++; else added++;
    rec.summary = slimSummary(a);
    rec._sync.summary = clock.now();
    // Keep legacy TIZ/provenance even for summary records (#7).
    listed.set(rec.id, rec);
  };

  const after = cursor.newSince();
  if (after) {
    log('Looking for new activities …');
    for (let page = 1; page < 50; page++) {
      const list = await strava.get('/athlete/activities', { after, per_page: PAGE, page }, { wait });
      if (!list || !list.length) break;
      list.forEach(upsert);
      if (list.length < PAGE) break;
    }
  }
  if (!cursor.complete) {
    log('Loading activity history …');
    for (let before = cursor.historyBefore(); before != null;) {
      let list;
      try { list = await strava.get('/athlete/activities', { before, per_page: PAGE }, { wait }); }
      catch (e) { if (strava.isDailyLimit(e)) break; throw e; }
      (list || []).forEach(upsert);
      before = cursor.historyPage(list, PAGE);
      if (before != null) log(`  … reached ${new Date(before * 1000).toLocaleDateString('en-GB')}`);
      if (cursor.complete) break;
    }
  }
  log(`List: ${added} new, ${updated} updated rides.`);
  return listed;
}

/** Gear details for the athlete's gear and every ride's gear, unless cached within the TTL. */
async function refreshGear({ strava, gear, rides, athlete }) {
  const ids = new Set(athleteGear(athlete).map((g) => g.id));
  for (const r of rides) if (r.summary?.gear_id) ids.add(r.summary.gear_id);
  for (const id of ids) {
    if (gear.isFresh(id)) continue;
    try {
      const g = await strava.get(`/gear/${id}`);
      if (g) gear.refresh(slimGear(g, id));
    } catch (e) { if (strava.isDailyLimit(e)) break; }
  }
}

/** Streams and details for rides that still lack them, newest first; each ride is saved on its own. */
async function fetchDetails({ strava, storage, clock, wait, noDetail, noStreams, limit }) {
  const todo = storage.list().filter((r) => (!noStreams && !r._sync?.streams) || (!noDetail && !r._sync?.detail));
  log(`${todo.length} rides still need details/per-second data.`);
  let done = 0, stopped = false;
  for (const rec of todo) {
    if (limit && done >= limit) break;
    try {
      rec._sync ||= {};
      let streamUpdate;
      if (!noStreams && !rec._sync.streams) {
        const st = rec.summary.manual ? null : await strava.get(`/activities/${rec.id}/streams`, { keys: STREAM_KEYS, key_by_type: true }, { wait });
        rec.metrics = st ? computeMetrics(rec.summary, st) : rec.metrics || computeMetrics(rec.summary, null);
        streamUpdate = { streams: st ? downsampleStreams(st) : null, streamsAt: clock.now() };
      }
      if (!noDetail && !rec._sync.detail) {
        const d = await strava.get(`/activities/${rec.id}`, { include_all_efforts: false }, { wait });
        if (d) rec.detail = slimDetail(d);
        rec._sync.detail = clock.now();
      }
      storage.save(rec, streamUpdate);
      done++;
      if (done % 10 === 0) log(`  … ${done}/${todo.length} rides (API today: ${strava.usage().daily}/${strava.usage().dailyLimit})`);
    } catch (e) {
      if (strava.isDailyLimit(e)) { stopped = true; break; }
      log(`⚠️  Error on ride ${rec.id}: ${e.message}`);
    }
  }
  return { todo: todo.length, done, stopped };
}
