/**
 * Zones file (src/data/zones.json): the rider's own HR zones, optionally dated, and power zone
 * bounds in % of FTP instead of Coggan. Pure, no I/O – callers pass the parsed file (or nothing).
 * An invalid file throws: silently falling back would hide the rider's zones.
 *
 *   { "heart_rate": [{ "from": "2025-03-01", "bpm": [0, 130, 150, 165, 180] }],
 *     "power": { "ftp_percent": [0, 55, 75, 90, 105, 120, 150] } }
 */
import { calendarDay } from './calendar-day.ts';
import type { Zone, ZoneSet } from './zones.ts';

/** The zones file as documented above (GLOSSARY "Zones file"); `readZonesFile` validates any parsed JSON against it. */
export interface ZonesFile {
  /** HR zones: lower bounds in bpm of Z1–Z5 (starting at 0), valid from `from` (a calendar day) or from the beginning. */
  heart_rate?: { from?: string; bpm: number[] }[] | null;
  /** Power zones: lower bounds of Z1–Z7 in % of FTP (starting at 0) instead of Coggan. */
  power?: { ftp_percent?: number[] | null } | null;
}

/** The validated zones file. */
export interface ZonesFileReader {
  /** HR zones valid on `day` ('YYYY-MM-DD', a calendar day): the last entry on or before it, before the first entry the first one; without entries `null`. */
  hrAt(day: string): ZoneSet | null;
  /** Lower bounds of the power zones in % of FTP, or `null` for Coggan. */
  powerPercents: number[] | null;
}

const HR_ZONES = 5;
const POWER_ZONES = 7;

const fail = (field: string, rule: string): never => { throw new Error(`zones.json: ${field} ${rule}`); };

/** Property `key` of parsed JSON, `undefined` when `value` is no object (like `value?.[key]`). */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/** Lower bounds of all zones, Z1 first: numbers ≥ 0, rising, starting at 0. */
function lowerBounds(value: unknown, n: number, name: string): number[] {
  const ok = Array.isArray(value) && value.length === n && value[0] === 0 &&
    value.every((x, i) => Number.isFinite(x) && (i === 0 || x > value[i - 1]));
  return ok ? value : fail(name, `must be ${n} rising lower bounds starting at 0`);
}

/** Lower bounds in bpm → HR zones ({ min, max }); the top zone is open-ended. */
const hrZones = (bpm: number[]): Zone[] => bpm.map((min, i) => ({ min, max: i < bpm.length - 1 ? bpm[i + 1] - 1 : null }));

/** HR entries sorted by date; an entry without `from` applies from the beginning (sorts first as ''). */
function hrEntries(list: unknown): { from: string; zones: Zone[] }[] {
  if (list == null) return [];
  if (!Array.isArray(list)) return fail('heart_rate', 'must be a list of { from, bpm } entries');
  const seen = new Set<string>();
  return list.map((entry: unknown, i) => {
    const date = field(entry, 'from');
    const from = date == null ? '' : typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? calendarDay(date) : null;
    if (from === null) return fail(`heart_rate[${i}].from`, 'must be a date (YYYY-MM-DD) or left out');
    if (seen.has(from)) fail(`heart_rate[${i}].from`, from ? `repeats ${from}` : 'is missing on more than one entry');
    seen.add(from);
    return { from, zones: hrZones(lowerBounds(field(entry, 'bpm'), HR_ZONES, `heart_rate[${i}].bpm`)) };
  }).sort((a, b) => a.from.localeCompare(b.from));
}

/** Parsed zones.json (`ZonesFile`; anything else throws), or nothing without a file. */
export function readZonesFile(raw: unknown): ZonesFileReader {
  const hr = hrEntries(field(raw, 'heart_rate'));
  const percents = field(field(raw, 'power'), 'ftp_percent');
  return {
    powerPercents: percents == null ? null : lowerBounds(percents, POWER_ZONES, 'power.ftp_percent'),
    hrAt(day) {
      let found = hr[0] ?? null;
      for (const x of hr) if (x.from <= day) found = x;
      return found?.zones ?? null;
    },
  };
}
