/**
 * Server-side data preparation for all pages (runs at build time or in the dev server).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getCollection } from 'astro:content';
import { athleteTimeline } from '../training/index.js';
import { processRide } from '../ride/index.js';
import { readOptionalPersonalJSON, readPersonalJSON } from './personal-data.js';
import { selectDataSource } from './data-source.js';
import { demoDayShift, shiftHistory, shiftInstant, shiftRideDates, shiftZonesFile } from './demo-clock.js';

const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

/** Real synced data or the shipped demo data (never mixed) – see data-source.js. */
const SOURCE = selectDataSource();
export const isDemo = () => SOURCE.demo;
/** Demo dates move forward in whole weeks so the newest demo ride is always recent; real data: 0. */
const SHIFT = SOURCE.demo ? demoDayShift(readJSON(path.join(SOURCE.dataDir, 'meta.json'), {})?.newest_day, new Date()) : 0;

let _raw;
const rawAthlete = () => (_raw ??= readJSON(path.join(SOURCE.dataDir, 'athlete.json'), {}) || {});

let _athlete;
/** Athlete for display (name, gear, sync status). FTP, body weight and zones come only from `athleteAt`. */
export function loadAthlete() {
  if (_athlete) return _athlete;
  const { zones, ...a } = rawAthlete();
  const { weight, ftp, ...profile } = a.profile || {};
  _athlete = { ...a, synced_at: SOURCE.demo ? shiftInstant(a.synced_at, SHIFT) : a.synced_at, profile: { first_name: '', last_name: '', ...profile }, gear: a.gear || [] };
  return _athlete;
}

let _timeline;
/** Athlete state timeline from athlete.json + fitness-history.json (athlete history, extended by the sync, editable by hand;
 * if the file is missing, fitness-history.example.json applies) + zones.json (optional, the rider's own zones; its example
 * file only documents the format). Demo: demo/data/. */
const timeline = () => (_timeline ??= athleteTimeline({
  athlete: rawAthlete(),
  history: shiftHistory(readPersonalJSON('fitness-history', [], { dir: SOURCE.dataDir }), SHIFT),
  zonesFile: shiftZonesFile(readOptionalPersonalJSON('zones', { dir: SOURCE.dataDir }), SHIFT),
}));
/** Athlete state (FTP, body weight, zones) on date `d` – see src/training/athlete-state.js. */
export const athleteAt = (d) => timeline().at(d);
/** Today's athlete state (build time). */
export const athleteToday = () => athleteAt(new Date());
/** Athlete history, sorted ascending, each entry with `d` (Date). */
export const loadHistory = () => timeline().history;
export const ftpAt = (d) => athleteAt(d).ftp;
export const weightAt = (d) => athleteAt(d).weight;

/** Frontmatter of a ride → compact, computed object. */
export function normalize(a) {
  const ride = shiftRideDates(a, SHIFT);
  return processRide(ride, athleteAt(ride.start_date_local));
}

let _rides;
export async function loadRides() {
  if (_rides) return _rides;
  const entries = await getCollection('rides');
  _rides = entries.map((e) => normalize(e.data)).filter((r) => !isNaN(r.d)).sort((a, b) => b.d - a.d);
  return _rides;
}
/** Stat rides only (no e-bikes) – the basis for totals, goals, power curves, records, years, bikes, segments. */
export const loadStatRides = async () => (await loadRides()).filter((r) => r.stats);

export function totals(rides) {
  const t = { n: rides.length, km: 0, h: 0, elev: 0, kj: 0, kcal: 0, tss: 0, pr: 0, ach: 0, kudos: 0, indoorH: 0 };
  for (const r of rides) {
    t.km += r.distance / 1000; t.h += r.h; t.elev += r.elev; t.kj += r.kj || 0; t.kcal += r.kcal || 0; t.tss += r.tss || 0;
    t.pr += r.pr; t.ach += r.ach; t.kudos += r.kudos; if (r.indoor) t.indoorH += r.h;
  }
  return t;
}
let _byId;
/** W/kg per curve point (`bestCurve` result): each best with the body weight on the date of its ride. */
export async function curveWkg(best) {
  _byId ??= new Map((await loadRides()).map((r) => [r.id, r]));
  return Object.fromEntries(Object.entries(best).map(([k, v]) => {
    const ride = _byId.get(String(v.id));
    return [k, ride ? +(v.w / ride.kg).toFixed(2) : null];
  }));
}

/* ---------------- Gear ---------------- */
let _gear;
export async function loadGear() {
  if (_gear) return _gear;
  let entries = [];
  try { entries = await getCollection('gear'); } catch { entries = []; }
  const byId = new Map(entries.map((e) => [String(e.data.id), { ...e.data, id: String(e.data.id), _entry: e }]));
  for (const g of loadAthlete().gear) if (!byId.has(String(g.id))) byId.set(String(g.id), { ...g, id: String(g.id) });
  const rides = await loadStatRides();
  _gear = Array.from(byId.values()).map((g) => {
    const rs = rides.filter((r) => r.gear_id === g.id);
    const t = totals(rs);
    const first = rs[rs.length - 1] || null, last = rs[0] || null;
    const price = g.custom && g.custom.price_eur;
    const kmTotal = t.km;
    return { ...g, type: g.type || (String(g.id).startsWith('b') ? 'bike' : 'shoe'), rides: rs, t, first, last, kmTotal, stravaKm: (g.distance || 0) / 1000, costPerKm: price && kmTotal ? price / kmTotal : null };
  }).sort((a, b) => Number(!!a.retired) - Number(!!b.retired) || b.kmTotal - a.kmTotal);
  return _gear;
}

/* ---------------- Read streams (for ride pages) ---------------- */
export function readStreams(id) {
  return readJSON(path.join(SOURCE.streamsDir, `${id}.json`), null);
}
/** Ids of the demo rides with streams – only while the demo data is active (real streams are served from public/). */
export function demoStreamIds() {
  if (!SOURCE.demo) return [];
  try { return fs.readdirSync(SOURCE.streamsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
}
