/**
 * Ride type: which Strava sport types are rides, which count in stats and which rides are indoor.
 * Pure, no I/O. Terms: GLOSSARY.md "Ride" / "Stat ride" / "Indoor ride".
 */

/** E-bike types (EBikeRide, EMountainBikeRide, future E…Ride). */
const isEBike = (t) => /^E[A-Z]\w*Ride$/.test(t || '');

/** Ride: every Strava cycling sport type (…Ride, velomobile, handcycle) – decides what the sync fetches. */
export const isRide = (t) => /Ride$/.test(t || '') || t === 'Velomobile' || t === 'Handcycle';

/** Stat ride: a human-powered ride, i.e. no e-bike – decides what totals, goals, load, power curves and records count. */
export const countsInStats = (t) => isRide(t) && !isEBike(t);

/** Indoor ride: on a trainer or a virtual ride (Zwift and similar) – no real route, so no places. */
export const isIndoor = (r) => !!r?.trainer || /^Virtual/.test(r?.sport_type || r?.type || '');
