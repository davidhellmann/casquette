/** Fitness (CTL) and fatigue (ATL): exponentially weighted load per day. Pure, no I/O. */

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/** Load of a ride: TSS, otherwise Relative Effort, otherwise 0. */
export const rideLoad = (r) => r.tss ?? r.re ?? 0;

const DAY_MS = 86400000;
const toUtc = (day) => Date.parse(day + 'T00:00:00Z');
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Daily series of fitness/fatigue. `rides`: `{ day: 'YYYY-MM-DD', tss?, re? }` in any order.
 * From `from` (default: earliest ride date) to `to` (inclusive, e.g. today) – one entry per calendar day
 * `{ day, load, ctl, atl, tsb }`; `tsb` = form = CTL − ATL of the previous day. Rides outside the period don't count.
 */
export function fitnessSeries(rides, { from, to }) {
  const perDay = new Map();
  for (const r of rides) {
    const l = rideLoad(r);
    if (l) (perDay.get(r.day) || perDay.set(r.day, []).get(r.day)).push(l);
  }
  const start = from ?? rides.reduce((m, r) => (!m || r.day < m ? r.day : m), null);
  if (!start) return [];
  const out = [];
  let ctl = 0, atl = 0;
  for (let t = toUtc(start), end = toUtc(to); t <= end; t += DAY_MS) {
    const day = toDay(t);
    // summed in ascending order → same result regardless of ride order
    const load = (perDay.get(day) || []).sort((a, b) => a - b).reduce((s, l) => s + l, 0);
    const tsb = ctl - atl;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    out.push({ day, load, ctl, atl, tsb });
  }
  return out;
}
