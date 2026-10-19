/** Power curve: best power per duration across a set of rides. Pure, no I/O. */

/**
 * Power curve of a ride: duration in seconds → best average power in watts over that duration.
 * A duration without a value (null or 0, possible in older ride files) does not count.
 */
export type PowerCurve = Record<string, number | null>;

/** Best curve: duration in seconds → the best power (`w`, watts) and the id of the ride it came from. */
export type BestCurve = Record<string, { w: number; id: string }>;

/**
 * Best curve per duration from the rides' power curves.
 * Rides without a power curve and empty values don't count; on a tie the ride passed first wins.
 */
export function bestCurve(rides: readonly { id: string; best?: PowerCurve | null }[]): BestCurve {
  const best: BestCurve = {};
  for (const r of rides) {
    if (!r.best) continue;
    for (const [sec, w] of Object.entries(r.best)) if (w && (!best[sec] || w > best[sec].w)) best[sec] = { w, id: r.id };
  }
  return best;
}
