import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './env.mjs';
import { frontmatter } from './store.mjs';
import { toYaml } from './yaml.mjs';
import { currentMetrics } from './metrics.mjs';
import { distributionTiz } from '../../src/ride/distribution.js';

/** Same complete context for online sync, standalone geo and offline rebuild. */
export function loadRideStorageContext({ root = ROOT, athlete = readJSON(path.join(root, 'src/data/athlete.json'), null) } = {}) {
  if (!athlete) throw new Error('Ride storage needs src/data/athlete.json.');
  const gear = Object.fromEntries((athlete.gear || []).map((g) => [g.id, g]));
  Object.assign(gear, readJSON(path.join(root, '.strava-cache/gear.json'), {}));
  return { zones: athlete.zones, gear };
}

/** One writer per checkout. Per-file replacement plus undo journal, NOT a multi-file
 * atomic transaction or a power-loss durability guarantee. Failed writes roll back;
 * if rollback itself fails, all public operations retry recovery before proceeding. */
export function createRideStorage({ root = ROOT, zones, gear = {} } = {}) {
  const cacheDir = path.join(root, '.strava-cache/activities');
  const journal = path.join(root, '.strava-cache/ride-storage-pending.json');
  // Journal name before the English rename; an interrupted write may still sit there.
  const legacyJournal = path.join(root, '.strava-cache/fahrt-pending.json');
  const cacheFile = (id) => path.join(cacheDir, `${id}.json`);
  const rideFile = (rec) => {
    const day = (rec.summary.start_date_local || rec.summary.start_date || '0000-00-00').slice(0, 10);
    return path.join(root, 'src/content/rides', day.slice(0, 4), `${day}_${rec.id}.md`);
  };
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
  function list() {
    recover();
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
      .map((f) => readJSON(path.join(cacheDir, f), null)).filter(Boolean);
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
    const removed = new Set(fields.flatMap((field) => REPLACES[field]));
    const rec = read(id);
    if (!rec?.summary) throw new Error(`Ride ${id} missing from cache`);
    const file = rideFile(rec);
    const existing = contents(file);
    const fm = existing?.match(/^(---\n)([\s\S]*?)(\n---\n?[\s\S]*)$/);
    if (!fm) throw new Error(`Ride ${id}: unknown Markdown format`);
    let matched = false;
    const front = fm[2].replace(/^metrics:\n((?:[ \t].*(?:\n|$)|\n)*)/m, (block) => {
      matched = true;
      let removing = false;
      const clean = block.split('\n').filter(line => {
        if (/^  \S/.test(line)) removing = removed.has(line.trim().split(':')[0]);
        return !removing || !line.trim();
      }).join('\n');
      const addition = toYaml(distributions).trimEnd().split('\n').map(line => '  ' + line).join('\n');
      return clean.trimEnd() + '\n' + addition + (block.endsWith('\n') ? '\n' : '');
    });
    if (!matched) throw new Error(`Ride ${id}: metrics missing from Markdown`);
    rec.metrics ||= {};
    for (const key of removed) delete rec.metrics[key];
    Object.assign(rec.metrics, distributions);
    commit([{ file, text: fm[1] + front + fm[3] }, { file: cacheFile(id), text: JSON.stringify(rec) }]);
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
    if (!oldFile.startsWith(path.join(root, 'src/content/rides') + path.sep)) throw new Error('Invalid ride path');
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
    const match = existing?.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    const description = (rec.detail?.description || '').trim();
    // A list-only file has no description yet. Populate it when details arrive,
    // but preserve authored text (including an emptied previously described body).
    const body = match && (match[1].trim() || previous?.detail?.description)
      ? match[1] : description ? `\n${description}\n` : match?.[1] || '';
    const fm = frontmatter(rec, zones, { gear_name: gear[rec.summary.gear_id]?.name });
    writes.push({ file, text: `---\n${toYaml(fm)}---\n${body}` });
    writes.push({ file: cacheFile(rec.id), text: JSON.stringify(rec) });
    if (oldFile !== file && fs.existsSync(oldFile)) writes.push({ file: oldFile, text: null });
    commit(writes);
    return rec;
  }
  recover();
  return { read, list, save, saveDistributions };
}
