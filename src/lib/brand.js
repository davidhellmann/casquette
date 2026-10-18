/**
 * The Casquette brand – the single source of the logo (#27). The logo is the owner-approved
 * "cap on the c": the word "casquette" set in the Damion font as-is (real text, self-hosted via the
 * Astro Fonts API) plus a pink full stop, with the cap sketch resting tilted on the "c".
 * Consumers: AppMark / AppLogo (sidebar) and scripts/site/brand.mjs (favicon, app icons, OG image,
 * README header). Rules: DESIGN.md → Brand.
 */

/**
 * The cap – the original sketch "f": a cotton cycling cap in three-quarter view, peak down, one
 * line with round caps and joins; the outline is ink, the one stripe on the crown the brand pink.
 * The viewBox is padded by 2 on every side so the strokes never clip.
 */
export const CAP = {
  viewBox: '-2 -2 48 36',
  /** height / width of the viewBox */
  aspect: 36 / 48,
  stroke: 2.4,
  /** The stripe is 1.3 × the outline stroke. */
  stripeFactor: 1.3,
  /** Crown, band (= the peak's base) and peak – drawn in ink. */
  outline: 'M6 21C6 10 14 4 23 4C32 4 37 10 37 18M6 21C14 23.5 28 23.5 37 18M37 18C39.5 17.4 41.5 17.8 42.5 19.2C40 22.6 33 25.2 25 25.6',
  stripe: 'M19.5 4.6C17.6 9.5 17.3 16.5 18.1 23.2',
};

/**
 * The word: Damion (SIL Open Font License), unchanged, line-height 1, followed by a full stop in
 * the brand pink. `cTop`: top of the "c"'s inline box relative to the line-height-1 box, in em –
 * (1 − (ascent + descent)) / 2 with Damion's ascent + descent = 1.374 em.
 */
export const WORDMARK = {
  font: 'Damion',
  text: 'casquette',
  stop: '.',
  cTop: -0.187,
};

/**
 * Where the cap sits on the "c" – the owner-approved formula (redesign notes, APPROVED-LOGO.html),
 * in em of the word's font size, relative to the word's line-height-1 box:
 * w0 = 1.04, h0 = w0 × 36/48; xTop = cTop + 0.42; left0 = cLeft − 0.40, top0 = xTop − h0 + 0.18;
 * pivot = (left0 + 0.30 w0 + 0.04, top0 + 0.90 h0 + 0.06); the final box is 90 % of the reference
 * around the pivot, rotated −19° about it (transform-origin 30 % 90 %).
 * `cTop` / `cLeft` default to Damion's metrics; the asset generator passes the measured values.
 */
export function capPlacement({ cTop = WORDMARK.cTop, cLeft = 0 } = {}) {
  const w0 = 1.04, h0 = w0 * CAP.aspect;
  const xTop = cTop + 0.42;
  const left0 = cLeft - 0.4, top0 = xTop - h0 + 0.18;
  const ax = left0 + 0.3 * w0 + 0.04, ay = top0 + 0.9 * h0 + 0.06;
  const width = 0.9 * w0, height = 0.9 * h0;
  return {
    left: ax - 0.3 * width,
    top: ay - 0.9 * height,
    width,
    height,
    rotate: -19,
    origin: '30% 90%',
  };
}

/** Brand colours as hex, for static assets that can't read the CSS tokens (keep in sync with app.css). */
export const COLORS = {
  ink: '#1c2130',
  grey: '#eceef1',
  paper: '#f7f8f9',
  muted: '#5b6270',
  navy: '#131b2e',
  navyDeep: '#0d1424',
  inkOnDark: '#e7eaf1',
  pink: '#f0468a',
  pinkOnDark: '#ff5c9c',
};
