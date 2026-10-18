import { calendarDate } from '../training/calendar-day.js';

/** Slim field selection – no renaming, no domain calculation. */
const FIELDS = ['id', 'name', 'sport_type', 'start_local', 'start', 'indoor', 'stats', 'gear_id',
  'distance', 'moving_time', 'elev', 'speed', 're', 'kcal', 'pr', 'ach',
  'w', 'avg_wkg', 'np', 'hr', 'hr_max', 'cad', 'ftp', 'kg', 'if_', 'tss', 'ef', 'load',
  'best', 'tizP', 'tizH', 'dec'];
const DEFAULTS = { ...Object.fromEntries(FIELDS.map((key) => [key, null])),
  stats: true, indoor: false, pr: 0, ach: 0, sport_type: 'Ride' };

export function dashboardRides(rides) {
  return rides.map((ride) => ({
    // Transport defaults only, no metrics: null and an explicit 0 stay distinguishable.
    ...Object.fromEntries(FIELDS.filter((key) => ride[key] != null && ride[key] !== DEFAULTS[key] && (key !== 'kg' || ride.best)).map((key) => [key, ride[key]])),
    ...(ride.clsP.zone != null || ride.clsP.source !== 'none'
      ? { clsP: { zone: ride.clsP.zone, source: ride.clsP.source } } : {}),
    ...(ride.clsH.zone !== ride.clsP.zone || ride.clsH.source !== ride.clsP.source
      ? { clsH: { zone: ride.clsH.zone, source: ride.clsH.source } } : {}),
    ...(ride.geo ? { geo: { places: ride.geo.places.map(({ name }) => ({ name })) } } : {}),
    ...(ride.tizP || ride.tizH ? { tizBasis: Object.fromEntries(Object.entries(ride.tizBasis).filter(([key]) => key === 'power' ? ride.tizP : ride.tizH).map(([key, { label, ...basis }]) =>
      [key, basis.zones ? { ...basis, label } : basis])) } : {}),
  }));
}

/** Once at the browser entry point: date, defaults and seconds → hours (lossless
 * unit display, no recomputation of IF/TSS/EF/load/zones). */
export function hydrateRides(rides) {
  const unknown = { zone: null, source: 'none' };
  return rides.map((ride) => ({ ...DEFAULTS, ...ride, h: (ride.moving_time || 0) / 3600,
    clsP: { ...(ride.clsP ?? unknown) }, clsH: { ...(ride.clsH ?? ride.clsP ?? unknown) }, d: calendarDate(ride.start_local) }))
    .filter((ride) => !isNaN(ride.d)).sort((a, b) => b.d - a.d);
}
