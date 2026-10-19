import fs from 'node:fs';
import path from 'node:path';
import { ROOT, errorMessage, readJSON } from '../../shared/env.ts';
import { patchRideMetrics, rideBody, rideFileName, rideFrontmatter, rideText } from '../../shared/ride-file.ts';
import type { ActivitySummary, RideFileRecord } from '../../shared/ride-file.ts';
import { currentMetrics } from '../../shared/metrics.ts';
import type { ChartStreams, Distribution, RideMetrics } from '../../shared/metrics.ts';
import type { Gear } from '../../shared/athlete-file.ts';
import { distributionTiz } from '../../../src/ride/distribution.ts';

/** Activity cache record (`.strava-cache/activities/<id>.json`): summary, details, derived stream
 * data and places of one ride – everything its ride file is made from – plus the ride file's path. */
export type ActivityRecord = RideFileRecord & {
  /** Path of the ride file, relative to the checkout. */
  file?: string;
};

/** A ride record: an activity cache record with a summary (what `list()` returns and `save` takes). */
export type RideRecord = ActivityRecord & { summary: ActivitySummary };

/** Known gear by id, the source of `gear_name`. */
export type GearById = Readonly<Record<string, Pick<Gear, 'name'>>>;

/** `streams`: new chart streams (`null` = the ride has none), written with the ride; `streamsAt`: their fetch time. */
export type SaveOptions = { streams?: ChartStreams | null; streamsAt?: number };

/** Distributions a backfill adds; each replaces its stored time in zones. */
export type DistributionFields = { power_distribution?: Distribution; hr_distribution?: Distribution };
type DistributionField = keyof DistributionFields;

/** The single place where the sync reads and writes ride files. */
export type RideStorage = {
  read(id: string): ActivityRecord | null;
  /** Every ride record (with summary), newest first. */
  list(): RideRecord[];
  /** Writes cache, ride file and (with `streams`) chart streams of a record; returns the stored record. */
  save(rec: RideRecord, options?: SaveOptions): RideRecord;
  /** Replaces stored time in zones by distributions, in cache and ride file only. */
  saveDistributions(id: string, distributions: DistributionFields): void;
};

/** One file change of a commit; `text: null` deletes the file. */
type Write = { file: string; text: string | null };

/** Ride storage over the activity cache, ride files and chart streams. `gear`: known gear by id
 * (athlete storage `gear().byId`), the source of `gear_name`.
 * One writer per checkout. Per-file replacement plus undo journal, NOT a multi-file
 * atomic transaction or a power-loss durability guarantee. Failed writes roll back;
 * if rollback itself fails, all public operations retry recovery before proceeding. */
export function createRideStorage({ root = ROOT, gear = {} }: { root?: string; gear?: GearById } = {}): RideStorage {
  const cacheDir = path.join(root, '.strava-cache/activities');
  const journal = path.join(root, '.strava-cache/ride-storage-pending.json');
  // Journal name before the English rename; an interrupted write may still sit there.
  const legacyJournal = path.join(root, '.strava-cache/fahrt-pending.json');
  const cacheFile = (id: string) => path.join(cacheDir, `${id}.json`);
  const ridesDir = path.join(root, 'src/content/rides');
  const rideFile = (rec: ActivityRecord) => path.join(ridesDir, rideFileName(rec));
  const contents = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const replace = (file: string, text: string | null) => {
    if (text === null) { if (fs.existsSync(file)) fs.unlinkSync(file); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.pending`;
    try {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, file);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  };
  function recover() {
    for (const file of [legacyJournal, journal]) {
      if (!fs.existsSync(file)) continue;
      // Do not silently ignore a damaged journal: writing must stop in that case.
      const undo: Write[] = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const { file: target, text } of undo.slice().reverse()) replace(path.join(root, target), text);
      fs.unlinkSync(file);
    }
  }
  // The cache files are written by `save` / `saveDistributions` only.
  const readRecord = (file: string) => readJSON(file, null) as ActivityRecord | null;
  function read(id: string) { recover(); return readRecord(cacheFile(id)); }
  function list() {
    recover();
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
      .map((f) => readRecord(path.join(cacheDir, f))).filter((rec): rec is RideRecord => !!rec?.summary)
      .sort((a, b) => String(b.summary.start_date).localeCompare(String(a.summary.start_date)));
  }
  function commit(writes: Write[]) {
    const undo = writes.map(({ file }) => ({ file: path.relative(root, file), text: contents(file) }));
    replace(journal, JSON.stringify(undo));
    try {
      for (const { file, text } of writes) replace(file, text);
      fs.unlinkSync(journal);
    } catch (error) {
      try { recover(); } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], 'Ride write and recovery both failed; journal kept for the next recovery.');
      }
      throw error;
    }
  }
  /** Stored time in zones each distribution replaces. */
  const REPLACES: Record<DistributionField, (keyof RideMetrics)[]> = {
    power_distribution: ['power_distribution', 'time_in_power_zones', 'time_in_power_zones_basis', 'ftp_used'],
    hr_distribution: ['hr_distribution', 'time_in_hr_zones', 'time_in_hr_zones_basis'],
  };
  /** Backfill changes only TIZ storage (power and/or HR distribution), never unrelated stale cache fields. */
  const isDistributionField = (field: string): field is DistributionField => Object.hasOwn(REPLACES, field);
  function saveDistributions(id: string, distributions: DistributionFields) {
    recover();
    const fields = Object.keys(distributions);
    for (const field of fields) {
      if (!isDistributionField(field)) throw new Error(`Unknown distribution ${field}`);
      if (!distributionTiz(distributions[field], [{ min: 0, max: null }])) throw new Error(`Invalid ${field === 'hr_distribution' ? 'HR' : 'power'} distribution`);
    }
    const removed = fields.filter(isDistributionField).flatMap((field) => REPLACES[field]);
    const rec = read(id);
    if (!rec?.summary) throw new Error(`Ride ${id} missing from cache`);
    const file = rideFile(rec);
    let text;
    try { text = patchRideMetrics(contents(file), { remove: removed, add: distributions }); }
    catch (error) { throw new Error(`Ride ${id}: ${errorMessage(error)}`); }
    const metrics = (rec.metrics ||= {});
    for (const key of removed) delete metrics[key];
    Object.assign(metrics, distributions);
    commit([{ file, text }, { file: cacheFile(id), text: JSON.stringify(rec) }]);
  }
  function save(input: RideRecord, { streams, streamsAt = Date.now() }: SaveOptions = {}) {
    recover();
    const rec = structuredClone(input);
    rec.metrics = currentMetrics(rec.summary, rec.metrics);
    const stamps = (rec._sync ||= {});
    const previous = read(rec.id);
    const file = rideFile(rec);
    const oldFile = previous?.file ? path.resolve(root, previous.file) : previous?.summary ? rideFile(previous) : file;
    // Only generated ride paths can be renamed; never trust arbitrary cache paths.
    if (!oldFile.startsWith(ridesDir + path.sep)) throw new Error('Invalid ride path');
    const streamFile = path.join(root, 'public/streams', `${rec.id}.json`);
    const writes: Write[] = [];
    if (streams !== undefined) {
      if (streams) writes.push({ file: streamFile, text: JSON.stringify(streams) });
      rec.streamsFile = !!streams;
      if (!streams && fs.existsSync(streamFile)) writes.push({ file: streamFile, text: null });
      stamps.streams = streamsAt;
    } else if (rec.streamsFile && !fs.existsSync(streamFile)) {
      // Missing charts must not keep a permanently completed stream flag.
      rec.streamsFile = false;
      delete stamps.streams;
    }
    rec.file = path.relative(root, file);
    const existing = contents(file) ?? contents(oldFile);
    // A list-only file has no description yet; it gets one when details arrive.
    const body = rideBody(rec, { existing, described: !!previous?.detail?.description });
    // An unknown or missing gear id finds no name (`gear_id` as property key, like `gear[undefined]`).
    writes.push({ file, text: rideText(rideFrontmatter(rec, { gearName: gear[String(rec.summary.gear_id)]?.name }), body) });
    writes.push({ file: cacheFile(rec.id), text: JSON.stringify(rec) });
    if (oldFile !== file && fs.existsSync(oldFile)) writes.push({ file: oldFile, text: null });
    commit(writes);
    return rec;
  }
  recover();
  return { read, list, save, saveDistributions };
}
