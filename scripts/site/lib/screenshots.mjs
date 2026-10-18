// Refs #14, #41: which product screenshots exist and how they are framed.
// Config + helpers (shared with e2e/screenshots.spec.ts); the capture runs in scripts/site/screenshots.mjs.

/** Every capture uses the same viewport and pixel density (2880×1800 output). */
export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };
export const THEMES = ['light', 'dark'];

/**
 * Key views. `{ride}` / `{year}` are filled in by planShots; `focus` (a selector, usually a
 * `data-testid` of a card or dashboard section) scrolls that element to the top of the viewport
 * for close-ups. Without `focus` the top of the page is shot.
 */
export const SHOTS = [
  { name: 'dashboard', path: '/' },
  { name: 'ride', path: '/rides/{ride}' },
  { name: 'ride-charts', path: '/rides/{ride}', focus: '[data-testid="ride-streams"]' },
  { name: 'map', path: '/map' },
  { name: 'year', path: '/years/{year}' },
  { name: 'performance', path: '/performance' },
  { name: 'zones', path: '/', focus: '[data-testid="dash-intensity"]' },
];

/** One capture per shot and theme, with the URL resolved against the preview server. */
export function planShots({ baseUrl, ride, year, shots = SHOTS, themes = THEMES }) {
  const base = baseUrl.replace(/\/$/, '');
  return shots.flatMap((shot) => {
    const url = base + shot.path.replace('{ride}', ride).replace('{year}', String(year));
    return themes.map((theme) => ({ file: `${shot.name}-${theme}.webp`, url, theme, focus: shot.focus ?? null }));
  });
}
