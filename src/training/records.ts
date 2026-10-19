/**
 * Records: the positive bests across a set of stat rides. Pure, no I/O.
 * Thresholds and the tie rule live here, so the dashboard, the year review and the bike page agree.
 */

/** A record kind (GLOSSARY "Records"). */
export type RecordKind = 'longest' | 'longestTime' | 'climb' | 'fastest' | 'np' | 'load' | 'prs' | 'maxHr';

/** What `records` reads of a ride; unknown values are null. */
export interface RecordRide {
  /** Metres. */
  distance?: number | null;
  /** Seconds. */
  moving_time?: number | null;
  /** Elevation gain in metres. */
  elev?: number | null;
  /** Average speed in m/s. */
  speed?: number | null;
  indoor?: boolean | null;
  np?: number | null;
  load?: number | null;
  /** PR count. */
  pr?: number | null;
  hr_max?: number | null;
  /** Actual start (Unix ms), null for legacy rides. */
  start?: number | null;
  /** Local start. */
  d: Date;
}

/** The record ride per kind, or null without a positive value. */
export type Records<R> = Record<RecordKind, R | null>;

interface Kind {
  value: (r: RecordRide) => number | null | undefined;
  admits?: (r: RecordRide) => boolean;
}

/** Per kind: the ride value it compares and, where needed, which rides qualify. */
const KINDS: Record<RecordKind, Kind> = {
  longest: { value: (r) => r.distance },
  longestTime: { value: (r) => r.moving_time },
  climb: { value: (r) => r.elev },
  /** Outdoor speed only from 30 minutes – short or indoor rides say nothing about speed. */
  fastest: { value: (r) => r.speed, admits: (r) => !r.indoor && (r.moving_time ?? 0) >= 1800 },
  /** NP only from 20 minutes. */
  np: { value: (r) => r.np, admits: (r) => (r.moving_time ?? 0) >= 1200 },
  load: { value: (r) => r.load },
  prs: { value: (r) => r.pr },
  maxHr: { value: (r) => r.hr_max },
};

/** The record kinds `records` returns, in this order. */
export const RECORD_KINDS: readonly RecordKind[] = ['longest', 'longestTime', 'climb', 'fastest', 'np', 'load', 'prs', 'maxHr'];

/** Actual start of a ride; legacy rides without one fall back to their local start (as in rideCalendar). */
const startOf = (r: RecordRide): number => r.start ?? +r.d;

/**
 * Stat rides in any order → the record ride per kind (`RECORD_KINDS`), or null.
 * A record is a positive value (unknown and 0 are never records); on a tie the more recent
 * ride (later actual start) wins, independent of the input order.
 */
export function records<R extends RecordRide>(rides: readonly R[]): Records<R> {
  const recordOf = (kind: RecordKind): R | null => {
    const { value, admits } = KINDS[kind];
    let best: R | null = null, top = 0;
    for (const r of rides) {
      const v = value(r);
      if (v == null || !(v > 0) || v < top || (admits && !admits(r))) continue;
      // `best` is null only while `top` is 0, and then `v > top` already holds.
      if (v > top || best === null || startOf(r) > startOf(best)) { best = r; top = v; }
    }
    return best;
  };
  return {
    longest: recordOf('longest'), longestTime: recordOf('longestTime'), climb: recordOf('climb'), fastest: recordOf('fastest'),
    np: recordOf('np'), load: recordOf('load'), prs: recordOf('prs'), maxHr: recordOf('maxHr'),
  };
}
