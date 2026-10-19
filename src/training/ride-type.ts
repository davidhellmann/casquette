/**
 * Ride type: which Strava sport types are rides, which count in stats and which rides are indoor.
 * Pure, no I/O. Terms: GLOSSARY.md "Ride" / "Stat ride" / "Indoor ride".
 */

/** A Strava sport type (`Ride`, `GravelRide`, `EBikeRide`, `Run` …); missing = unknown. */
type SportType = string | null | undefined;

/** Kind of e-bike ride for display: e-MTB or any other e-bike type. */
export type EBikeKind = 'emtb' | 'ebike';

/** E-bike types (EBikeRide, EMountainBikeRide, future E…Ride). */
const isEBike = (t: SportType): boolean => /^E[A-Z]\w*Ride$/.test(t || '');

/** Ride: every Strava cycling sport type (…Ride, velomobile, handcycle) – decides what the sync fetches. */
export const isRide = (t: SportType): boolean => /Ride$/.test(t || '') || t === 'Velomobile' || t === 'Handcycle';

/** Stat ride: a human-powered ride, i.e. no e-bike – decides what totals, goals, load, power curves and records count. */
export const countsInStats = (t: SportType): boolean => isRide(t) && !isEBike(t);

/** Kind of e-bike ride for display: 'emtb' (e-MTB), 'ebike' (any other e-bike type) or null for a stat ride. */
export const eBikeKind = (t: SportType): EBikeKind | null => (!isEBike(t) ? null : /Mountain/.test(t || '') ? 'emtb' : 'ebike');
/** Indoor ride: on a trainer or a virtual ride (Zwift and similar) – no real route, so no places. */
export const isIndoor = (r: { trainer?: boolean | null; sport_type?: SportType; type?: SportType } | null | undefined): boolean =>
  !!r?.trainer || /^Virtual/.test(r?.sport_type || r?.type || '');
