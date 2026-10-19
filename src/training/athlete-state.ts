/**
 * Athlete state: FTP, body weight, power and HR zones that applied on a date. Pure, no I/O –
 * callers pass the contents of athlete.json, fitness-history.json and zones.json (all may be missing).
 * "Today" is just a special case: `at(new Date())`.
 */
import { calendarDate, calendarDay } from './calendar-day.ts';
import { cogganZones, ftpPercentZones, DEFAULT_ZONES, DEFAULT_HR_ZONES } from './zones.ts';
import type { ZoneSet, Zones } from './zones.ts';
import { readZonesFile } from './zones-file.ts';

/**
 * The athlete data as the athlete state reads it from athlete.json (written by the sync; the file holds more).
 * Only positive finite numbers count as measurements.
 */
export interface AthleteData {
  profile?: { ftp?: number | null; weight?: number | null } | null;
  /** Today's zones from Strava; only `ftp` and the HR zones are used (power zones always derive from FTP). */
  zones?: {
    ftp?: number | null;
    heart_rate_zones?: ZoneSet | null;
    /** Strava's origin of the HR zones; `'Default'` means Strava has none of the rider's own. */
    heart_rate_zone_source?: string | null;
    power_zones?: ZoneSet | null;
  } | null;
}

/** One athlete history entry (fitness-history.json): FTP and/or body weight from the calendar day `date` on. */
export interface AthleteHistoryEntry {
  /** Calendar day ('YYYY-MM-DD') the values apply from. */
  date: string;
  ftp?: number | null;
  weight?: number | null;
  id?: string;
  /** Where the entry came from, e.g. 'strava' or 'manual'. */
  source?: string | null;
  note?: string | null;
}

/** An athlete history entry with its calendar day as a Date (local midnight). */
export type DatedHistoryEntry = AthleteHistoryEntry & { d: Date };

/** Where the zones of an athlete state come from. */
export interface ZoneSource {
  power: 'file' | 'default';
  hr: 'file' | 'strava' | 'default';
}

/** The zones of an athlete state: power zones from its FTP, HR zones valid on its date. */
export interface AthleteZones extends Zones {
  /** Strava's origin of its current HR zones, passed through from the athlete data. */
  heart_rate_zone_source: string | null | undefined;
  source: ZoneSource;
}

/** Athlete state: FTP (W), body weight (kg) and zones that apply on a date (GLOSSARY "Athlete state"). */
export interface AthleteState {
  ftp: number;
  weight: number;
  zones: AthleteZones;
}

/** The athlete state on any date, plus the sorted athlete history it is read from. */
export interface AthleteTimeline {
  /** Athlete state on the calendar day of `date` (Date: host-local components; string: its written day). */
  at(date: Date | string): AthleteState;
  /** Valid history entries, oldest first. */
  history: DatedHistoryEntry[];
}

/** Input of `athleteTimeline`; every part may be missing. */
export interface AthleteTimelineInput {
  /** athlete.json */
  athlete?: AthleteData | null;
  /** fitness-history.json */
  history?: readonly AthleteHistoryEntry[] | null;
  /** zones.json, parsed but unchecked (an invalid zones file throws – see zones-file.ts) */
  zonesFile?: unknown;
}

/** Body weight when neither the athlete history nor the athlete data knows one. */
export const DEFAULT_WEIGHT = 75;
const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Athlete history → valid entries with `d` (Date), sorted ascending. */
function sortHistory(history: readonly AthleteHistoryEntry[] | null | undefined): DatedHistoryEntry[] {
  return (Array.isArray(history) ? history : [])
    .filter((x) => x && calendarDay(x.date))
    .map((x) => ({ ...x, d: calendarDate(calendarDay(x.date)) }))
    .sort((a, b) => +a.d - +b.d);
}

/** Value of `key` at `t`: the last entry on or before `t`, before that the first entry, otherwise `null`. */
function valueAt(history: readonly DatedHistoryEntry[], key: 'ftp' | 'weight', t: string | null): number | null {
  let v: number | null = null;
  for (const x of history) {
    const value = x[key];
    if (!positive(value)) continue;
    const day = calendarDay(x.d);
    if (v == null || (day !== null && t !== null && day <= t)) v = value;
    else break;
  }
  return v;
}

/**
 * - FTP and body weight: each value separately from the athlete history (before the first entry the first one
 *   applies), otherwise the current athlete data (zones.ftp, then profile.ftp; profile.weight), otherwise the
 *   defaults (FTP 200 W, 75 kg). Only positive finite numbers count as measurements; invalid values are skipped per field.
 * - Power zones: from the FTP on the date (today too; never Strava's power zones) – with the bounds in % of FTP
 *   from the zones file, otherwise Coggan.
 * - HR zones: the zones file entry valid on the date, otherwise the current ones from Strava (Strava provides
 *   no history), otherwise the default HR zones.
 */
export function athleteTimeline({ athlete, history, zonesFile }: AthleteTimelineInput = {}): AthleteTimeline {
  const a: AthleteData = athlete || {};
  const z: NonNullable<AthleteData['zones']> = a.zones || {};
  const p: NonNullable<AthleteData['profile']> = a.profile || {};
  const h = sortHistory(history);
  const file = readZonesFile(zonesFile);
  const stravaHr: ZoneSet | null = Array.isArray(z.heart_rate_zones) && z.heart_rate_zones.length && z.heart_rate_zone_source !== 'Default'
    ? z.heart_rate_zones : null;
  const ftpNow = [z.ftp, p.ftp].find(positive) ?? DEFAULT_ZONES.ftp;
  const weightNow = positive(p.weight) ? p.weight : DEFAULT_WEIGHT;
  return {
    history: h,
    at(date) {
      const t = calendarDay(date);
      const ftp = valueAt(h, 'ftp', t) || ftpNow;
      const weight = valueAt(h, 'weight', t) || weightNow;
      // An invalid date (no calendar day) is read as '': only an entry without `from` matches, else the first entry applies.
      const fileHr = file.hrAt(t ?? '');
      return {
        ftp, weight,
        zones: {
          ftp,
          power_zones: file.powerPercents ? ftpPercentZones(ftp, file.powerPercents) : cogganZones(ftp),
          heart_rate_zones: fileHr ?? stravaHr ?? DEFAULT_HR_ZONES,
          heart_rate_zone_source: z.heart_rate_zone_source,
          source: { hr: fileHr ? 'file' : stravaHr ? 'strava' : 'default', power: file.powerPercents ? 'file' : 'default' },
        },
      };
    },
  };
}
