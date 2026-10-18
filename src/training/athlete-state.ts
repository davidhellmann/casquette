// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Athlete state: FTP, body weight, power and HR zones that applied on a date. Pure, no I/O –
 * callers pass the contents of athlete.json, fitness-history.json and zones.json (all may be missing).
 * "Today" is just a special case: `at(new Date())`.
 */
import { calendarDate, calendarDay } from './calendar-day.ts';
import { cogganZones, ftpPercentZones, DEFAULT_ZONES, DEFAULT_HR_ZONES } from './zones.ts';
import { readZonesFile } from './zones-file.ts';

/** Body weight when neither the athlete history nor the athlete data knows one. */
export const DEFAULT_WEIGHT = 75;
const positive = (value) => Number.isFinite(value) && value > 0;

/** Athlete history → valid entries with `d` (Date), sorted ascending. */
function sortHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((x) => x && calendarDay(x.date))
    .map((x) => ({ ...x, d: calendarDate(calendarDay(x.date)) }))
    .sort((a, b) => a.d - b.d);
}

/** Value of `key` at `t`: the last entry on or before `t`, before that the first entry, otherwise `null`. */
function valueAt(history, key, t) {
  let v = null;
  for (const x of history) {
    if (!positive(x[key])) continue;
    if (v == null || calendarDay(x.d) <= t) v = x[key];
    else break;
  }
  return v;
}

/**
 * @param {{ athlete?: object, history?: object[], zonesFile?: object }} input  athlete.json, fitness-history.json
 *   and zones.json (raw; an invalid zones file throws – see zones-file.ts)
 * @returns {{ at(date: Date|string): AthleteState, history: object[] }}
 *
 * AthleteState = `{ ftp, weight, zones: { ftp, power_zones, heart_rate_zones, heart_rate_zone_source, source } }`,
 * `source` = where the zones come from: `{ power: 'file'|'default', hr: 'file'|'strava'|'default' }`.
 * - FTP and body weight: each value separately from the athlete history (before the first entry the first one
 *   applies), otherwise the current athlete data (zones.ftp, then profile.ftp; profile.weight), otherwise the
 *   defaults (FTP 200 W, 75 kg). Only positive finite numbers count as measurements; invalid values are skipped per field.
 * - Power zones: from the FTP on the date (today too; never Strava's power zones) – with the bounds in % of FTP
 *   from the zones file, otherwise Coggan.
 * - HR zones: the zones file entry valid on the date, otherwise the current ones from Strava (Strava provides
 *   no history), otherwise the default HR zones.
 */
export function athleteTimeline({ athlete, history, zonesFile } = {}) {
  const a = athlete || {};
  const z = a.zones || {};
  const p = a.profile || {};
  const h = sortHistory(history);
  const file = readZonesFile(zonesFile);
  const stravaHr = Array.isArray(z.heart_rate_zones) && z.heart_rate_zones.length && z.heart_rate_zone_source !== 'Default'
    ? z.heart_rate_zones : null;
  const ftpNow = [z.ftp, p.ftp].find(positive) ?? DEFAULT_ZONES.ftp;
  const weightNow = positive(p.weight) ? p.weight : DEFAULT_WEIGHT;
  return {
    history: h,
    at(date) {
      const t = calendarDay(date);
      const ftp = valueAt(h, 'ftp', t) || ftpNow;
      const weight = valueAt(h, 'weight', t) || weightNow;
      const fileHr = file.hrAt(t);
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
