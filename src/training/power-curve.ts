// @ts-nocheck – typed in phase B of docs/adr/0004
/** Power curve: best power per duration across a set of rides. Pure, no I/O. */

/**
 * Best curve per duration (seconds → { w, id }) from the rides' power curves (`{ id, best: { [sec]: watts } }`).
 * Rides without a power curve and empty values don't count; on a tie the ride passed first wins.
 * @returns {Record<string, { w: number, id: string }>}
 */
export function bestCurve(rides) {
  const best = {};
  for (const r of rides) {
    if (!r.best) continue;
    for (const [sec, w] of Object.entries(r.best)) if (w && (!best[sec] || w > best[sec].w)) best[sec] = { w, id: r.id };
  }
  return best;
}
