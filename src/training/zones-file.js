/**
 * Zones file (src/data/zones.json): the rider's own HR zones, optionally dated, and power zone
 * bounds in % of FTP instead of Coggan. Pure, no I/O – callers pass the parsed file (or nothing).
 * An invalid file throws: silently falling back would hide the rider's zones.
 *
 *   { "heart_rate": [{ "from": "2025-03-01", "bpm": [0, 130, 150, 165, 180] }],
 *     "power": { "ftp_percent": [0, 55, 75, 90, 105, 120, 150] } }
 */
import { calendarDay } from './calendar-day.js';

const HR_ZONES = 5;
const POWER_ZONES = 7;

const fail = (field, rule) => { throw new Error(`zones.json: ${field} ${rule}`); };

/** Lower bounds of all zones, Z1 first: numbers ≥ 0, rising, starting at 0. */
function lowerBounds(value, n, field) {
  const ok = Array.isArray(value) && value.length === n && value[0] === 0 &&
    value.every((x, i) => Number.isFinite(x) && (i === 0 || x > value[i - 1]));
  if (!ok) fail(field, `must be ${n} rising lower bounds starting at 0`);
  return value;
}

/** Lower bounds in bpm → HR zones ({ min, max }); the top zone is open-ended. */
const hrZones = (bpm) => bpm.map((min, i) => ({ min, max: i < bpm.length - 1 ? bpm[i + 1] - 1 : null }));

/** HR entries sorted by date; an entry without `from` applies from the beginning (sorts first as ''). */
function hrEntries(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) fail('heart_rate', 'must be a list of { from, bpm } entries');
  const seen = new Set();
  return list.map((entry, i) => {
    const from = entry?.from == null ? '' : /^\d{4}-\d{2}-\d{2}$/.test(entry.from) ? calendarDay(entry.from) : null;
    if (from === null) fail(`heart_rate[${i}].from`, 'must be a date (YYYY-MM-DD) or left out');
    if (seen.has(from)) fail(`heart_rate[${i}].from`, from ? `repeats ${from}` : 'is missing on more than one entry');
    seen.add(from);
    return { from, zones: hrZones(lowerBounds(entry?.bpm, HR_ZONES, `heart_rate[${i}].bpm`)) };
  }).sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * @param {object|null|undefined} raw  parsed zones.json, or nothing without a file
 * @returns {{ hrAt(day: string): object[]|null, powerPercents: number[]|null }}  `day` = 'YYYY-MM-DD' (calendar day)
 */
export function readZonesFile(raw) {
  const hr = hrEntries(raw?.heart_rate);
  const percents = raw?.power?.ftp_percent;
  return {
    /** Lower bounds of the power zones in % of FTP, or `null` for Coggan. */
    powerPercents: percents == null ? null : lowerBounds(percents, POWER_ZONES, 'power.ftp_percent'),
    /** Last entry on or before `day`; before the first entry the first one; without entries `null`. */
    hrAt(day) {
      let found = hr[0] ?? null;
      for (const x of hr) if (x.from <= day) found = x;
      return found?.zones ?? null;
    },
  };
}
