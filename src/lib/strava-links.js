/**
 * Links to strava.com. Strava ids are numeric; the demo data uses ids like `demo-0165`,
 * `demo-seg-mesa-1` or `bdemo2`, which must never turn into (broken) strava.com links.
 * Every helper returns null for such ids, so callers simply hide the link.
 * Pure, no I/O – used by pages and client scripts.
 */
const STRAVA = 'https://www.strava.com';

/** True for a real (numeric) Strava id. */
export const isStravaId = (id) => /^\d+$/.test(String(id ?? ''));

export const activityUrl = (id) => (isStravaId(id) ? `${STRAVA}/activities/${id}` : null);
export const segmentUrl = (id) => (isStravaId(id) ? `${STRAVA}/segments/${id}` : null);

/** Strava gear ids carry a type prefix: `b<id>` = bike, `g<id>` = shoe. */
export function gearUrl(id) {
  const m = /^([bg])(\d+)$/.exec(String(id ?? ''));
  return m ? `${STRAVA}/${m[1] === 'b' ? 'bikes' : 'shoes'}/${m[2]}` : null;
}
