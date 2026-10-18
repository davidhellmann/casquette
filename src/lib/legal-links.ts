// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Links from the app to the legal pages of the website it is hosted with (#55). The hosted demo is
 * built with PUBLIC_LEGAL_URL = the website's origin (e.g. https://casquette.es/), and the sidebar
 * links to its legal notice and privacy policy; without it (every self-hosted copy) there are none.
 * Pure, no I/O.
 */

/**
 * @param {string | undefined | null} siteUrl the website's URL (PUBLIC_LEGAL_URL)
 * @returns {{ notice: string, privacy: string } | null} absolute URLs, or null when unset
 * @throws when set but not an http(s) URL – a broken deploy setting should fail the build
 */
export function legalLinks(siteUrl) {
  const raw = String(siteUrl ?? '').trim();
  if (!raw) return null;
  let base;
  try { base = new URL(raw); } catch { base = null; }
  if (!base || !/^https?:$/.test(base.protocol)) throw new Error(`PUBLIC_LEGAL_URL must be an http(s) URL such as https://example.com/, got "${raw}"`);
  // The site's folder: a trailing slash, so the page names resolve inside it
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return {
    notice: new URL('legal-notice.html', base).href,
    privacy: new URL('privacy-policy.html', base).href,
  };
}
