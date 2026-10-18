// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from '../../shared/env.ts';
import { patchRideMetrics, rideBody, rideFileName, rideFrontmatter, rideText } from '../../shared/ride-file.ts';
import { currentMetrics } from '../../shared/metrics.ts';
import { distributionTiz } from '../../../src/ride/distribution.ts';

/** Ride storage over the activity cache, ride files and chart streams. `gear`: known gear by id
 * (athlete storage `gear().byId`), the source of `gear_name`.
 * One writer per checkout. Per-file replacement plus undo journal, NOT a multi-file
 * atomic transaction or a power-loss durability guarantee. Failed writes roll back;
 * if rollback itself fails, all public operations retry recovery before proceeding. */
export function createRideStorage({ root = ROOT, gear = {} } = {}) {
  const cacheDir = path.join(root, '.strava-cache/activities');
  const journal = path.join(root, '.strava-cache/ride-storage-pending.json');
  // Journal name before the English rename; an interrupted write may still sit there.
  const legacyJournal = path.join(root, '.strava-cache/fahrt-pending.json');
  const cacheFile = (id) => path.join(cacheDir, `${id}.json`);
  const ridesDir = path.join(root, 'src/content/rides');
  const rideFile = (rec) => path.join(ridesDir, rideFileName(rec));
  const contents = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const replace = (file, text) => {
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
      const undo = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const { file: target, text } of undo.slice().reverse()) replace(path.join(root, target), text);
      fs.unlinkSync(file);
    }
  }
  function read(id) { recover(); return readJSON(cacheFile(id), null); }
  /** Every ride record (with summary), newest first. */
  function list() {
    recover();
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
      .map((f) => readJSON(path.join(cacheDir, f), null)).filter((rec) => rec?.summary)
      .sort((a, b) => String(b.summary.start_date).localeCompare(String(a.summary.start_date)));
  }
  function commit(writes) {
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
  const REPLACES = {
    power_distribution: ['power_distribution', 'time_in_power_zones', 'time_in_power_zones_basis', 'ftp_used'],
    hr_distribution: ['hr_distribution', 'time_in_hr_zones', 'time_in_hr_zones_basis'],
  };
  /** Backfill changes only TIZ storage (power and/or HR distribution), never unrelated stale cache fields. */
  function saveDistributions(id, distributions) {
    recover();
    const fields = Object.keys(distributions);
    for (const field of fields) {
      if (!REPLACES[field]) throw new Error(`Unknown distribution ${field}`);
      if (!distributionTiz(distributions[field], [{ min: 0, max: null }])) throw new Error(`Invalid ${field === 'hr_distribution' ? 'HR' : 'power'} distribution`);
    }
    const removed = fields.flatMap((field) => REPLACES[field]);
    const rec = read(id);
    if (!rec?.summary) throw new Error(`Ride ${id} missing from cache`);
    const file = rideFile(rec);
    let text;
    try { text = patchRideMetrics(contents(file), { remove: removed, add: distributions }); }
    catch (error) { throw new Error(`Ride ${id}: ${error.message}`); }
    rec.metrics ||= {};
    for (const key of removed) delete rec.metrics[key];
    Object.assign(rec.metrics, distributions);
    commit([{ file, text }, { file: cacheFile(id), text: JSON.stringify(rec) }]);
  }
  function save(input, { streams, streamsAt = Date.now() } = {}) {
    recover();
    const rec = structuredClone(input);
    rec.metrics = currentMetrics(rec.summary, rec.metrics);
    rec._sync ||= {};
    const previous = read(rec.id);
    const file = rideFile(rec);
    const oldFile = previous?.file ? path.resolve(root, previous.file) : previous?.summary ? rideFile(previous) : file;
    // Only generated ride paths can be renamed; never trust arbitrary cache paths.
    if (!oldFile.startsWith(ridesDir + path.sep)) throw new Error('Invalid ride path');
    const streamFile = path.join(root, 'public/streams', `${rec.id}.json`);
    const writes = [];
    if (streams !== undefined) {
      if (streams) writes.push({ file: streamFile, text: JSON.stringify(streams) });
      rec.streamsFile = !!streams;
      if (!streams && fs.existsSync(streamFile)) writes.push({ file: streamFile, text: null });
      rec._sync.streams = streamsAt;
    } else if (rec.streamsFile && !fs.existsSync(streamFile)) {
      // Missing charts must not keep a permanently completed stream flag.
      rec.streamsFile = false;
      delete rec._sync.streams;
    }
    rec.file = path.relative(root, file);
    const existing = contents(file) ?? contents(oldFile);
    // A list-only file has no description yet; it gets one when details arrive.
    const body = rideBody(rec, { existing, described: !!previous?.detail?.description });
    writes.push({ file, text: rideText(rideFrontmatter(rec, { gearName: gear[rec.summary.gear_id]?.name }), body) });
    writes.push({ file: cacheFile(rec.id), text: JSON.stringify(rec) });
    if (oldFile !== file && fs.existsSync(oldFile)) writes.push({ file: oldFile, text: null });
    commit(writes);
    return rec;
  }
  recover();
  return { read, list, save, saveDistributions };
}
