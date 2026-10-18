/**
 * Internal URLs of the site: every page path under the Astro base in one place, for build pages and
 * islands alike. Pure – external Strava links live in strava-links.js.
 */

/** Site base URL with a trailing slash (Astro `base`). */
export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const query = (params) => {
  const q = Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return q ? `?${q}` : '';
};

export const routes = {
  /** The ride log. */
  rides: () => `${BASE}rides`,
  /** A ride page. */
  ride: (id) => `${BASE}rides/${id}`,
  /** A bike's page. */
  gear: (id) => `${BASE}gear/${id}`,
  /** A year review. */
  year: (year) => `${BASE}years/${year}`,
  /** A segment page. */
  segment: (id) => `${BASE}segments/${id}`,
  /** The map, optionally filtered (`{ country, place }`; null/undefined values are left out). */
  map: (params = {}) => `${BASE}map${query(params)}`,
  /** A ride's chart streams (JSON). */
  streams: (id) => `${BASE}streams/${id}.json`,
};
