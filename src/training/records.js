/**
 * Records: the positive bests across a set of stat rides. Pure, no I/O.
 * Thresholds and the tie rule live here, so the dashboard, the year review and the bike page agree.
 */

/** Per kind: the ride value it compares and, where needed, which rides qualify. */
const KINDS = {
  longest: { value: (r) => r.distance },
  longestTime: { value: (r) => r.moving_time },
  climb: { value: (r) => r.elev },
  /** Outdoor speed only from 30 minutes – short or indoor rides say nothing about speed. */
  fastest: { value: (r) => r.speed, admits: (r) => !r.indoor && r.moving_time >= 1800 },
  /** NP only from 20 minutes. */
  np: { value: (r) => r.np, admits: (r) => r.moving_time >= 1200 },
  load: { value: (r) => r.load },
  prs: { value: (r) => r.pr },
  maxHr: { value: (r) => r.hr_max },
};

/** The record kinds `records` returns. */
export const RECORD_KINDS = Object.keys(KINDS);

/** Actual start of a ride; legacy rides without one fall back to their local start (as in rideCalendar). */
const startOf = (r) => r.start ?? +r.d;

/**
 * Stat rides in any order → the record ride per kind (`RECORD_KINDS`), or null.
 * A record is a positive value (unknown and 0 are never records); on a tie the more recent
 * ride (later actual start) wins, independent of the input order.
 */
export function records(rides) {
  return Object.fromEntries(Object.entries(KINDS).map(([kind, { value, admits }]) => {
    let best = null, top = 0;
    for (const r of rides) {
      const v = value(r);
      if (v == null || !(v > 0) || v < top || (admits && !admits(r))) continue;
      if (v > top || startOf(r) > startOf(best)) { best = r; top = v; }
    }
    return [kind, best];
  }));
}
