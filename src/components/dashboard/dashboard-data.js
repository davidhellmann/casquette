/**
 * Dashboard data for the React views: the build payload (#dash-data, see src/lib/dashboard-payload.js)
 * turned into one dashboard period. Pure – no DOM, no storage; the hook in use-dashboard.ts adds those.
 */
import { dashboardPeriod } from '../../dashboard-period/index.js';
import { hydrateRides } from '../../scripts/dashboard-data.js';

/** Rides from the payload, hydrated once (dates, defaults). */
export function dashboardSource(raw) {
  const athlete = raw.athlete || {};
  return { athlete, rides: hydrateRides(raw.rides || []), goals: raw.goals || [], base: raw.base || '/', streamsCount: raw.streamsCount || 0 };
}

/** All card data for one period and basis at `now`. */
export function computeDashboard(source, { days, basis, now }) {
  const { athlete, rides } = source;
  return dashboardPeriod(rides, { days, basis, now, gear: athlete.gear || [], athleteState: athlete.athleteState });
}
