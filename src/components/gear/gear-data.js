/**
 * Chart and card data of the gear pages (src/pages/gear/*.astro), computed at build time from a
 * bike's rides (normalised rides: `d`, `year`, `month`, `distance`, `moving_time`, `elev` …).
 * Pure: no I/O, no DOM.
 */
import { yearTotals } from '../../training/index.js';

const kmOf = (rides) => rides.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
const pad = (n) => String(n).padStart(2, '0');

/** Kilometres per calendar year from the first to the last ride (years without rides = 0), rounded. */
export function kmPerYear(rides) {
  const totals = yearTotals(rides);
  if (!totals.length) return [];
  const km = new Map(totals.map((y) => [y.year, y.km])), out = [];
  for (let y = totals[0].year; y <= totals.at(-1).year; y++) out.push({ year: y, km: Math.round(km.get(y) ?? 0) });
  return out;
}

/** Kilometres per month for the `n` months up to and including the month of `now` ('YYYY-MM' keys), rounded. */
export function kmPerMonth(rides, now, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(now.getFullYear(), now.getMonth() - (n - 1) + i, 1);
    const y = m.getFullYear(), mo = m.getMonth();
    return { key: `${y}-${pad(mo + 1)}`, km: Math.round(kmOf(rides.filter((r) => r.year === y && r.month === mo))) };
  });
}

/** Ride type of a ride on a bike: indoor, gravel, MTB or road/outdoor. */
export const rideType = (r) => (r.indoor ? 'indoor' : r.sport_type === 'GravelRide' ? 'gravel' : r.sport_type === 'MountainBikeRide' ? 'mtb' : 'road');

/** Kilometres per ride type (only types with distance), largest first, rounded. */
export function kmPerType(rides) {
  const by = {};
  for (const r of rides) by[rideType(r)] = (by[rideType(r)] || 0) + (r.distance || 0) / 1000;
  return Object.entries(by).map(([type, km]) => ({ type, km: Math.round(km) })).filter((x) => x.km > 0).sort((a, b) => b.km - a.km);
}

/**
 * Kilometres per bike and year for a stacked chart: one row per year (all years with a ride on any
 * of the bikes), one key per bike id. Bikes without rides are left out.
 */
export function kmPerBikeAndYear(bikes) {
  const used = bikes.filter((b) => b.rides.length);
  const years = [...new Set(used.flatMap((b) => b.rides.map((r) => r.year)))].sort((a, b) => a - b);
  const rows = years.map((year) => Object.fromEntries([['year', year], ...used.map((b) => [b.id, Math.round(kmOf(b.rides.filter((r) => r.year === year)))])]));
  return { bikes: used.map((b) => ({ id: b.id, name: b.name })), rows };
}

/** Average outdoor speed in km/h (total distance / total moving time), or null without outdoor rides. */
export function avgOutdoorSpeed(rides) {
  const outdoor = rides.filter((r) => !r.indoor);
  if (!outdoor.length) return null;
  return (kmOf(outdoor) * 1000) / Math.max(1, outdoor.reduce((s, r) => s + r.moving_time, 0)) * 3.6;
}
