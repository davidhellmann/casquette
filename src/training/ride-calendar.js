import { startOfDay } from './calendar-day.js';

/** Actual-start admission and local calendar extent are deliberately separate.
 * Completed rides east of the viewer can belong to tomorrow; E-bikes cannot
 * advance a statistics period. Unknown actual starts retain the legacy fallback.
 */
export function rideCalendar(rides, now) {
  const available = rides.filter(r => (r.start ?? +r.d) <= +now);
  let end = startOfDay(now);
  for (const r of available) if (r.stats && r.d > end) end = startOfDay(r.d);
  return { available, end };
}
