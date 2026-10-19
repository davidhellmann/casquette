/**
 * Internal URLs of the site: every page path under the Astro base in one place, for build pages and
 * islands alike. Pure – external Strava links live in strava-links.js.
 */

/** Site base URL with a trailing slash (Astro `base`). */
export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const query = (params: Record<string, string | number | null | undefined>): string => {
  const q = Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return q ? `?${q}` : '';
};

export const routes = {
  /** The ride log. */
  rides: () => `${BASE}rides`,
  /** A ride page. */
  ride: (id: string | number) => `${BASE}rides/${id}`,
  /** A bike's page. */
  gear: (id: string | number) => `${BASE}gear/${id}`,
  /** A year review. */
  year: (year: number | string) => `${BASE}years/${year}`,
  /** A segment page. */
  segment: (id: string | number) => `${BASE}segments/${id}`,
  /** The map, optionally filtered (`{ country, place }`; null/undefined values are left out). */
  map: (params: { country?: string | null; place?: string | null } = {}) => `${BASE}map${query(params)}`,
  /** A ride's chart streams (JSON). */
  streams: (id: string | number) => `${BASE}streams/${id}.json`,
};
