// The website's deploy-time template step (#55), pure – no I/O. `npm run site:build`
// (scripts/site/site-build.mjs → site-build.mjs) reads the files and calls these.
//
// - The legal pages (website/legal-notice.html, website/privacy-policy.html) carry placeholders
//   like {{SITE_LEGAL_NAME}} for every personal detail; the values come from environment
//   variables at deploy time and are never committed.
// - Cabin (privacy-friendly analytics) is injected into every HTML page only when SITE_CABIN_HOST
//   is set; blocks between <!-- if:cabin --> and <!-- end:cabin --> (the Cabin parts of the
//   privacy policy) are kept with it and dropped without it.

/** Every legal variable, in the order an error lists them. */
const LEGAL_VARS = ['SITE_LEGAL_NAME', 'SITE_LEGAL_ADDRESS', 'SITE_LEGAL_COUNTRY', 'SITE_LEGAL_EMAIL'];
const CABIN_VAR = 'SITE_CABIN_HOST';
/** Every placeholder a page may use. */
const PLACEHOLDERS = [...LEGAL_VARS, CABIN_VAR];

/** Thrown for anything the build refuses: missing or invalid variables, leftover placeholders. */
export class SiteBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SiteBuildError';
  }
}

/** Text as HTML: safe in element content and in quoted attribute values. */
export const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Address lines from one variable: separated by `|` or new lines (real or a literal `\n`). */
export const addressLines = (value) => String(value ?? '')
  .split(/\r?\n|\\n|\|/)
  .map((line) => line.trim())
  .filter(Boolean);

const EMAIL = /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/;
const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Reads and checks the site variables. Throws one SiteBuildError naming every problem, so a deploy
 * fails loudly instead of publishing an incomplete legal notice.
 * @returns {{ legal: { name: string, address: string[], country: string, email: string }, cabinHost: string | null }}
 */
export function readSiteEnv(env = {}) {
  const value = (key) => String(env[key] ?? '').trim();
  const problems = [];
  const missing = LEGAL_VARS.filter((key) => !value(key));
  if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
  const address = addressLines(env.SITE_LEGAL_ADDRESS);
  if (value('SITE_LEGAL_ADDRESS') && !address.length) problems.push('SITE_LEGAL_ADDRESS has no address lines');
  if (value('SITE_LEGAL_EMAIL') && !EMAIL.test(value('SITE_LEGAL_EMAIL'))) problems.push(`SITE_LEGAL_EMAIL is not an email address: "${value('SITE_LEGAL_EMAIL')}"`);
  const cabinHost = value(CABIN_VAR) || null;
  if (cabinHost && !HOST.test(cabinHost)) problems.push(`${CABIN_VAR} must be a bare host name such as scripts.withcabin.com or cabin.example.com (no https://, no path): "${cabinHost}"`);
  if (problems.length) throw new SiteBuildError(`Site build: ${problems.join('; ')}. See website/README.md.`);
  return {
    legal: { name: value('SITE_LEGAL_NAME'), address, country: value('SITE_LEGAL_COUNTRY'), email: value('SITE_LEGAL_EMAIL') },
    cabinHost: cabinHost && cabinHost.toLowerCase(),
  };
}

/** The HTML each placeholder is replaced with: escaped values, address lines joined by <br>. */
export function placeholderValues({ legal, cabinHost }) {
  return {
    SITE_LEGAL_NAME: escapeHtml(legal.name),
    SITE_LEGAL_ADDRESS: legal.address.map(escapeHtml).join('<br>\n'),
    SITE_LEGAL_COUNTRY: escapeHtml(legal.country),
    SITE_LEGAL_EMAIL: escapeHtml(legal.email),
    ...(cabinHost ? { SITE_CABIN_HOST: escapeHtml(cabinHost) } : {}),
  };
}

/** Replaces {{KEY}} with values[KEY] (already HTML); unknown keys stay for findLeftovers(). */
export const fillPlaceholders = (html, values) =>
  html.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key) => (Object.hasOwn(values, key) ? values[key] : match));

/** Placeholders still in `html` – `{{…}}` of any kind, so a typo can't slip through. */
export const findLeftovers = (html) => [...new Set(html.match(/\{\{[^{}]*\}\}|\{\{/g) ?? [])];

/**
 * Conditional blocks: `<!-- if:name -->…<!-- end:name -->` keeps its content (without the markers)
 * when `on`, and drops it otherwise.
 */
export function applyBlock(html, name, on) {
  const block = new RegExp(`[ \\t]*<!-- if:${name} -->([\\s\\S]*?)<!-- end:${name} -->[ \\t]*\\n?`, 'g');
  return html.replace(block, (match, inner) => (on ? inner : ''));
}

/** The Cabin script tag for a host (the default scripts.withcabin.com or a custom subdomain). */
export const cabinScript = (host) => `<script async defer src="https://${escapeHtml(host)}/hello.js"></script>`;

/** True for a full page (fragments such as website/ui/*.html have no <body> and get no script). */
const isPage = (html) => /<\/body>/i.test(html);

/**
 * Adds the Cabin script before </body> of a page. No host, no page, or already there: unchanged.
 */
export function injectCabin(html, host) {
  if (!host || !isPage(html)) return html;
  const tag = cabinScript(host);
  if (html.includes(tag)) return html;
  const at = html.search(/<\/body>/i);
  return `${html.slice(0, at)}  ${tag}\n${html.slice(at)}`;
}

/**
 * One website HTML file for the deploy: fill placeholders, keep or drop the Cabin blocks, inject
 * Cabin. Throws when a placeholder is left over; `file` names it in the message.
 */
export function renderPage(html, config, file = 'page') {
  const filled = fillPlaceholders(applyBlock(html, 'cabin', Boolean(config.cabinHost)), placeholderValues(config));
  const leftovers = findLeftovers(filled);
  if (leftovers.length) throw new SiteBuildError(`Site build: ${file} still contains ${leftovers.join(', ')}`);
  return injectCabin(filled, config.cabinHost);
}
