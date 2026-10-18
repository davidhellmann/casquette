/** Build data for the dashboard and ride log: slim rides + today's athlete state as JSON for #dash-data. */
import { BASE } from '../components/app/nav.ts';
import { loadRides, loadAthlete, athleteToday } from './data.js';
import { dashboardRides } from '../scripts/dashboard-data.js';

export async function dashboardPayload(extra = {}) {
  const rides = await loadRides();
  const athlete = loadAthlete();
  const payload = {
    base: BASE,
    athlete: { profile: athlete.profile, athleteState: athleteToday(), gear: athlete.gear, synced_at: athlete.synced_at, sync: athlete.sync },
    rides: dashboardRides(rides),
    streamsCount: rides.filter((r) => r.streams).length,
    ...extra,
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
