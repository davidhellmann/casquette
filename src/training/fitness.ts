/** Fitness (CTL) and fatigue (ATL): exponentially weighted load per day. Pure, no I/O. */
import { dayOrdinal, ordinalDay } from './calendar-day.ts';

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/** What the load of a ride is read from: TSS and Relative Effort (`re`); unknown = null. */
export interface LoadInput {
  tss?: number | null;
  re?: number | null;
}

/** A ride as `fitnessSeries` reads it: its ride date and load inputs. */
export interface FitnessRide extends LoadInput {
  /** Ride date ('YYYY-MM-DD'); a ride without a valid ride date (null) does not count. */
  day: string | null;
}

/** One calendar day of the fitness series. */
export interface FitnessDay {
  /** Calendar day ('YYYY-MM-DD'). */
  day: string;
  /** Summed load of the day's rides. */
  load: number;
  /** Fitness (CTL) after the day. */
  ctl: number;
  /** Fatigue (ATL) after the day. */
  atl: number;
  /** Form (TSB): CTL − ATL of the previous day. */
  tsb: number;
}

/** Load of a ride: TSS, otherwise Relative Effort, otherwise 0. */
export const rideLoad = (r: LoadInput): number => r.tss ?? r.re ?? 0;

/**
 * Daily series of fitness/fatigue. `rides` in any order.
 * From `from` (default: earliest ride date) to `to` (inclusive, e.g. today) – one entry per calendar day;
 * `tsb` = form = CTL − ATL of the previous day. Rides outside the period don't count.
 */
export function fitnessSeries(rides: readonly FitnessRide[], { from, to }: { from?: string; to: string }): FitnessDay[] {
  const perDay = new Map<string, number[]>();
  for (const r of rides) {
    const l = rideLoad(r);
    if (l && r.day !== null) {
      const loads = perDay.get(r.day);
      if (loads) loads.push(l); else perDay.set(r.day, [l]);
    }
  }
  const start = from ?? rides.reduce<string | null>((m, r) => (!m || (r.day !== null && r.day < m) ? r.day : m), null);
  if (!start) return [];
  const out: FitnessDay[] = [];
  let ctl = 0, atl = 0;
  for (let n = dayOrdinal(start), end = dayOrdinal(to); n <= end; n++) {
    const day = ordinalDay(n);
    // summed in ascending order → same result regardless of ride order
    const load = (perDay.get(day) || []).sort((a, b) => a - b).reduce((s, l) => s + l, 0);
    const tsb = ctl - atl;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    out.push({ day, load, ctl, atl, tsb });
  }
  return out;
}
