import path from 'node:path';
import { log, ROOT, readJSON, writeJSON } from './env.mjs';
import { computeMetrics, downsampleStreams, normZones } from './metrics.mjs';
import { cogganZones, DEFAULT_HR_ZONES, isRide } from '../../src/training/index.js';
import { writeGear } from './gear-file.mjs';
import { slimSummary, slimDetail } from './strava.mjs';
import { createRideStorage, loadRideStorageContext } from './ride-storage.mjs';
const STREAM_KEYS = 'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth';
const FRAME = { 1: 'MTB', 2: 'Cross', 3: 'Road', 4: 'Time trial', 5: 'Gravel' };

const epoch = (a) => Math.floor(Date.parse(a.start_date) / 1000);
/** The actual sync orchestration, with CLI I/O supplied at the entry point for local tests.
 * No alternate Strava adapter and no environment/auth loading in this module. */
export async function runSync({ root = ROOT, strava, geocodeRides, options = {}, fallback = {} }) {
  const get = strava.get;
  const { wait: WAIT = false, noDetail: NO_DETAIL = false, noStreams: NO_STREAMS = false,
    noGeo: NO_GEO = false, limit: LIMIT = 0, geoBudgetMin = 15 } = options;
  const STATE_FILE = path.join(root, '.strava-cache/state.json');
  const GEAR_FILE = path.join(root, '.strava-cache/gear.json');
  const DATA_DIR = path.join(root, 'src/data');
  const ATHLETE_FILE = path.join(DATA_DIR, 'athlete.json');
  const state = readJSON(STATE_FILE, { listComplete: false, oldest: null, newest: null });
  const saveState = () => writeJSON(STATE_FILE, state);
  const started = Date.now();

  /* ---------- Athlete, zones, stats ---------- */
  log('Fetching athlete and zones …');
  const athlete = await get('/athlete');
  let apiZones = null, stats = null;
  try { apiZones = await get('/athlete/zones'); } catch (e) { log('Zones unavailable:', e.message); }
  try { stats = await get(`/athletes/${athlete.id}/stats`); } catch {}
  const weight = athlete.weight || Number(fallback.weight) || null;
  const ftp = athlete.ftp || Number(fallback.ftp) || null;
  const zones = {
    ftp,
    heart_rate_zones: normZones(apiZones && apiZones.heart_rate && apiZones.heart_rate.zones) || DEFAULT_HR_ZONES,
    heart_rate_zone_source: apiZones && apiZones.heart_rate ? (apiZones.heart_rate.custom_zones ? 'Manual' : 'Strava') : 'Default',
    power_zones: normZones(apiZones && apiZones.power && apiZones.power.zones) || (ftp ? cogganZones(ftp) : null),
  };
  const context = loadRideStorageContext({ root, athlete: { ...readJSON(ATHLETE_FILE, {}), zones } });
  const gearCache = context.gear;
  // Even a rate-limited gear endpoint must not discard names already supplied by /athlete.
  for (const g of [...(athlete.bikes || []), ...(athlete.shoes || [])]) {
    gearCache[g.id] ||= { ...g, type: String(g.id).startsWith('b') ? 'bike' : 'shoe' };
  }
  const storage = createRideStorage({ root, ...context });
  const pending = new Map();

  /* ---------- Activity list ---------- */
  let added = 0, updated = 0;
  const upsert = (a) => {
    const e = epoch(a);
    if (Number.isFinite(e)) {
      state.newest = Math.max(state.newest || 0, e);
      state.oldest = state.oldest ? Math.min(state.oldest, e) : e;
    }
    if (!isRide(a.sport_type || a.type)) return;
    const rec = pending.get(String(a.id)) || storage.read(String(a.id)) || { id: String(a.id), _sync: {} };
    rec._sync ||= {};
    if (rec.summary) updated++; else added++;
    rec.summary = slimSummary(a);
    rec._sync.summary = Date.now();
    // Keep legacy TIZ/provenance even for summary records (#7).
    pending.set(rec.id, rec);
  };

  if (state.newest) {
    log('Looking for new activities …');
    const after = state.newest - 3 * 86400;
    for (let page = 1; page < 50; page++) {
      const list = await get('/athlete/activities', { after, per_page: 200, page }, { wait: WAIT });
      if (!list || !list.length) break;
      list.forEach(upsert);
      if (list.length < 200) break;
    }
  }
  if (!state.listComplete) {
    log('Loading activity history …');
    let before = state.listCursor || Math.floor(Date.now() / 1000) + 86400;
    for (;;) {
      let list;
      try { list = await get('/athlete/activities', { before, per_page: 200 }, { wait: WAIT }); }
      catch (e) { if (strava.isDailyLimit(e)) break; throw e; }
      if (!list || !list.length) { state.listComplete = true; break; }
      list.forEach(upsert);
      before = Math.min(...list.map(epoch));
      state.listCursor = before;
      log(`  … reached ${new Date(before * 1000).toLocaleDateString('en-GB')}`);
      if (list.length < 200) { state.listComplete = true; break; }
    }
  }
  log(`List: ${added} new, ${updated} updated rides.`);

  /* ---------- Gear ---------- */
  const gearIds = new Set([...(athlete.bikes || []), ...(athlete.shoes || [])].map((g) => g.id));
  for (const r of [...storage.list(), ...pending.values()]) if (r.summary?.gear_id) gearIds.add(r.summary.gear_id);
  for (const gid of gearIds) {
    if (gearCache[gid] && Date.now() - gearCache[gid]._at < 7 * 86400e3) continue;
    try {
      const g = await get(`/gear/${gid}`);
      if (g) gearCache[gid] = {
        id: g.id, name: g.name || g.nickname || gid, type: String(g.id).startsWith('b') ? 'bike' : 'shoe',
        brand: g.brand_name || null, model: g.model_name || null, frame_type: FRAME[g.frame_type] || null,
        description: g.description || null, distance: g.distance || 0, retired: !!g.retired, primary: !!g.primary,
        weight: g.weight || null, _at: Date.now(),
      };
    } catch (e) { if (strava.isDailyLimit(e)) break; }
  }
  writeJSON(GEAR_FILE, gearCache);
  const gear = Object.values(gearCache).map(({ _at, ...g }) => g);
  gear.forEach((g) => writeGear(g, { root }));
  // First save only after names from current list + cached rides + athlete are known.
  // The same context object is retained for details and geo; no per-call enrichment.
  for (const rec of pending.values()) storage.save(rec);
  saveState();

  /* ---------- Athlete file for the site ---------- */
  const athleteData = {
    synced_at: new Date().toISOString(),
    profile: {
      id: athlete.id, first_name: athlete.firstname, last_name: athlete.lastname, username: athlete.username,
      city: athlete.city, state: athlete.state, country: athlete.country, sex: athlete.sex,
      weight, ftp, premium: !!(athlete.summit || athlete.premium), created_at: athlete.created_at, avatar: athlete.profile || null,
    },
    zones, gear, stats,
    sync: { list_complete: !!state.listComplete, oldest: state.oldest ? new Date(state.oldest * 1000).toISOString() : null },
  };
  writeJSON(ATHLETE_FILE, athleteData);

  /* ---------- Extend FTP/weight history (only on change) ---------- */
  const HIST_FILE = path.join(DATA_DIR, 'fitness-history.json');
  const hist = readJSON(HIST_FILE, []);
  const lastH = hist.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
  if (!lastH || lastH.ftp !== ftp || lastH.weight !== weight) {
    const day = new Date().toISOString().slice(0, 10);
    const entry = { id: day, date: day, ftp, weight, source: 'strava', note: lastH ? 'Change detected in Strava' : 'Initial value from Strava' };
    writeJSON(HIST_FILE, [...hist.filter((h) => h.id !== day), entry]);
    log(`📈 New entry in fitness-history.json: FTP ${ftp} W, ${weight} kg`);
  }

  /* ---------- Details and streams (newest first) ---------- */
  const todo = storage.list()
    .filter((r) => (!NO_STREAMS && !r._sync?.streams) || (!NO_DETAIL && !r._sync?.detail));
  log(`${todo.length} rides still need details/per-second data.`);
  let done = 0, stopped = false;
  for (const rec of todo) {
    if (LIMIT && done >= LIMIT) break;
    try {
      rec._sync ||= {};
      let streamUpdate;
      if (!NO_STREAMS && !rec._sync.streams) {
        const st = rec.summary.manual ? null : await get(`/activities/${rec.id}/streams`, { keys: STREAM_KEYS, key_by_type: true }, { wait: WAIT });
        rec.metrics = st ? computeMetrics(rec.summary, st) : rec.metrics || computeMetrics(rec.summary, null);
        streamUpdate = { streams: st ? downsampleStreams(st) : null, streamsAt: Date.now() };
      }
      if (!NO_DETAIL && !rec._sync.detail) {
        const d = await get(`/activities/${rec.id}`, { include_all_efforts: false }, { wait: WAIT });
        if (d) rec.detail = slimDetail(d);
        rec._sync.detail = Date.now();
      }
      storage.save(rec, streamUpdate);
      done++;
      if (done % 10 === 0) log(`  … ${done}/${todo.length} rides (API today: ${strava.usage().daily}/${strava.usage().dailyLimit})`);
    } catch (e) {
      if (strava.isDailyLimit(e)) { stopped = true; break; }
      log(`⚠️  Error on ride ${rec.id}: ${e.message}`);
    }
  }

  /* ---------- Places (reverse geocoding, with time budget) ---------- */
  if (!NO_GEO) {
    try {
      await geocodeRides(storage.list(), {
        budgetMs: Number(geoBudgetMin) * 60e3,
        onRide: (rec) => storage.save(rec),
      });
    } catch (e) { log(`⚠️  Places skipped: ${e.message}`); }
  }

  const left = todo.length - done;
  log(`✅ Done in ${Math.round((Date.now() - started) / 1000)} s · ${strava.usage().calls} API calls · ${done} rides with details`);
  if (!state.listComplete || left > 0) {
    log(`ℹ️  Still pending: ${state.listComplete ? '' : 'parts of the activity list, '}${left} rides with details.` +
      (stopped ? ' Strava daily limit reached – just run `npm run sync` again tomorrow (or leave `npm run sync:all` running).' : ''));
  }
}
