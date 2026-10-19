/** Zones: Coggan power zones, default zones and the zone assignment of a value. Pure, no I/O. */
import { t } from '../i18n/index.ts';

/** Which measurement a view evaluates (GLOSSARY "Basis"). */
export type Basis = 'power' | 'hr';

/** One zone in watts or bpm: `max` is the inclusive upper bound, `null` for the open-ended top zone. */
export interface Zone {
  min: number;
  max: number | null;
}

/** The zones of one basis, Z1 first (7 power zones or 5 HR zones). */
export type ZoneSet = readonly Zone[];

/** Zones of both bases (GLOSSARY "Zones"); `ftp` is the FTP the power zones derive from. */
export interface Zones {
  ftp: number;
  power_zones: ZoneSet;
  heart_rate_zones: ZoneSet;
}

/**
 * Index (0-based) of the zone `v` falls into. Values below Z1 land in Z1; the top zone is open-ended.
 * Only the lower bounds count; a missing lower bound counts as 0.
 */
export function zoneIdx(v: number, zones: readonly { min?: number | null; max?: number | null }[]): number {
  for (let i = zones.length - 1; i >= 0; i--) if (v >= (zones[i].min || 0)) return i;
  return 0;
}

/** Coggan fractions of FTP: lower bounds of Z1–Z7. */
const COGGAN = [0, 0.55, 0.75, 0.9, 1.05, 1.2, 1.5];

/** Rounded watt bounds → power zones: each zone starts 1 W above the previous bound, Z1 at 0, the top zone is open-ended. */
const fromWattBounds = (b: number[]): Zone[] => b.map((min, i) => ({ min: i === 0 ? 0 : min + 1, max: i < b.length - 1 ? b[i + 1] : null }));

/** Coggan power zones from FTP (7 zones, whole watts, Z7 open-ended). */
export function cogganZones(ftp: number): Zone[] {
  return fromWattBounds(COGGAN.map((p) => Math.round(p * ftp)));
}

/** Power zones from FTP and custom lower bounds in % of FTP (zones file), same rounding as Coggan. */
export function ftpPercentZones(ftp: number, percents: readonly number[]): Zone[] {
  return fromWattBounds(percents.map((p) => Math.round((p * ftp) / 100)));
}

/** Names of power zones Z1–Z7 (Coggan). */
export const POWER_ZONE_NAMES = t('zones.power');
/** Names of HR zones Z1–Z5. */
export const HR_ZONE_NAMES = t('zones.hr');

/** HR zones when Strava provides none. */
export const DEFAULT_HR_ZONES: ZoneSet = Object.freeze([{ min: 0, max: 129 }, { min: 130, max: 149 }, { min: 150, max: 164 }, { min: 165, max: 179 }, { min: 180, max: null }]);

/** Zones when no athlete data exists (FTP 200 W, Coggan power zones, default HR zones). */
export const DEFAULT_ZONES: Readonly<Zones> = Object.freeze({
  ftp: 200,
  power_zones: cogganZones(200),
  heart_rate_zones: DEFAULT_HR_ZONES,
});
