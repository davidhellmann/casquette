// @ts-nocheck – typed in phase B of docs/adr/0004
// Refs #46: real UI fragments for the website – which pieces of the demo build are captured and how
// their markup is made static. Config + pure helpers (unit-tested); the browser driver lives in
// scripts/site/fragments.ts, the stylesheet transform in ./css-scope.ts.
import path from 'node:path';
import { t } from '../../../src/i18n/index.ts';
import { remToPx } from './css-scope.ts';

/** The class of the wrapper every fragment sits in; the stylesheet is `@scope`d to it. */
export const SCOPE_CLASS = 'ui-fragment';
/** Capture viewport (CSS px): the app's desktop layout, as in the README screenshots. */
export const VIEWPORT = { width: 1440, height: 900 };
/** Map crop pixel density. */
export const MAP_SCALE = 2;
/** Clock for build and browser: one day after the newest demo ride, so the demo dates are not moved
 * (src/lib/demo-clock.ts) and the dashboard periods always show the same rides. */
export const TIME_ZONE = 'Europe/Berlin';
/** App fonts the fragments use (their CSS variables), renamed so they can't clash with the host's. */
const FONT_VARS = ['--font-geist', '--font-geist-mono'];
const FONT_PREFIX = 'Casquette UI ';

/**
 * The pieces. `root` selects the captured element (`label`: the one whose text starts with it),
 * `keep` limits it to the children matching one of the selectors (the rest is removed).
 * `anchor`: the side that has to stay visible when the website lets the piece bleed off the edge.
 */
export const PIECES = [
  {
    name: 'dashboard', path: '/', anchor: 'left',
    note: 'Dashboard top: key figures and the fitness chart (hero)',
    root: '[data-testid=dashboard]',
    keep: ['[data-testid=kpis]', '[data-slot=chart-card]:has([data-testid=fitness-chart])'],
  },
  {
    name: 'load', path: '/', anchor: 'left',
    note: 'Training load key figure with its sparkline (hero float)',
    root: '[data-testid=kpis] > [data-slot=kpi-card]', label: t('dash.kpi.load'),
  },
  {
    name: 'calendar', path: '/', anchor: 'right',
    note: 'Training calendar of the last 52 weeks (hero float; newest weeks on the right)',
    root: '[data-slot=chart-card]:has([data-testid=calendar-legend])',
  },
  {
    name: 'intensity', path: '/', anchor: 'left',
    note: 'Dashboard intensity section: weekly volume and time by zone, time in zones, rhythm',
    root: '[data-testid=dash-intensity]',
  },
  {
    name: 'ride', path: '/rides/{ride}', anchor: 'right',
    note: 'Ride streams: power, heart rate, cadence, speed, elevation (mirrored section)',
    root: '[data-testid=ride-streams]',
  },
  {
    name: 'year', path: '/years/{year}', anchor: 'left',
    note: 'Year review head: key figures and the training calendar',
    root: '[data-testid=year-review]',
    keep: ['header', '[data-testid=year-kpis]', '[data-slot=chart-card]:has([data-testid=calendar-legend])'],
  },
];

/** The route map can't be markup (Leaflet tiles): a light and a dark image crop instead. */
export const MAP = {
  name: 'map', path: '/map', anchor: 'right',
  note: 'Route map with filters and places panel (image; places panel on the right)',
  root: '[data-testid=map-view]',
};

/** Fixed "now" for a demo dataset whose newest ride is `newestDay` ('YYYY-MM-DD'): the next day at noon. */
export function fixedNow(newestDay) {
  const d = new Date(`${newestDay}T12:00:00Z`);
  if (Number.isNaN(+d)) throw new Error(`Invalid newest demo day "${newestDay}"`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** One URL per page, `{ride}` / `{year}` filled in. */
export const piecePath = (piece, { ride, year }) => piece.path.replace('{ride}', ride).replace('{year}', String(year));

/**
 * Whether an attribute survives in a static fragment. Event handlers, links, focus and id
 * references go; classes, styles, data/state attributes and SVG geometry stay (the app's CSS may
 * select on them). HTML ids go (they would clash on the host page); SVG ids stay for gradients and
 * clip paths (renamed later). Self-contained: it also runs in the page.
 */
export function keepAttribute(name, value, svg) {
  // Attributes that reference other elements by id – meaningless (or broken) in a lone copy
  const idRefs = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto', 'for', 'form', 'list', 'popovertarget', 'commandfor'];
  // Behaviour, focus and links
  const behaviour = ['tabindex', 'href', 'target', 'rel', 'ping', 'download', 'src', 'srcset', 'action', 'formaction', 'name', 'autofocus', 'contenteditable', 'draggable', 'accesskey', 'popover', 'title', 'nonce', 'data-hydrated'];
  const n = name.toLowerCase();
  if (n.startsWith('on') || n.startsWith('data-astro') || idRefs.includes(n)) return false;
  if (svg) {
    if (n === 'href' || n === 'xlink:href') return String(value).startsWith('#');
    return n !== 'tabindex' && n !== 'focusable';
  }
  return n !== 'id' && !behaviour.includes(n);
}

/**
 * Runs in the page (serialised with its source – no outer references): strips a captured element
 * down to static markup. Removes scripts, hidden and screen-reader-only nodes, Recharts tooltips and
 * comments, unwraps Astro islands, filters attributes with `keep` (keepAttribute) and pulls the
 * inline <style> elements (shadcn chart colours) out. Returns their CSS.
 */
export function cleanTree(root, keep) {
  const css = [];
  const drop = (el) => el.remove();
  root.querySelectorAll('style').forEach((el) => { css.push(el.textContent); drop(el); });
  root.querySelectorAll('script, template, noscript, link, iframe, .sr-only, [hidden], .recharts-tooltip-wrapper').forEach(drop);
  for (const el of [...root.querySelectorAll('*')]) {
    if (el.isConnected && getComputedStyle(el).display === 'none') drop(el);
  }
  root.querySelectorAll('astro-island, astro-slot, astro-static-slot').forEach((el) => el.replaceWith(...el.childNodes));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const svg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    for (const a of [...el.attributes]) if (!keep(a.name, a.value, svg)) el.removeAttribute(a.name);
  }
  return css;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Stable, page-unique names for the ids (SVG gradients, clip paths) and shadcn chart ids in one
 * fragment: React's generated ids would clash between fragments and change with every app edit.
 * Rewrites the references in the markup and in the fragment's chart CSS alike.
 */
export function renameRefs(html, css, prefix) {
  const ids = [...new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  const charts = [...new Set([...html.matchAll(/\sdata-chart="([^"]+)"/g)].map((m) => m[1]))];
  let h = html;
  let c = css;
  ids.forEach((id, i) => {
    const to = `${prefix}-${i + 1}`;
    const e = esc(id);
    h = h.replace(new RegExp(`(\\sid=")${e}"`, 'g'), `$1${to}"`)
      .replace(new RegExp(`url\\((&quot;|["']?)#${e}\\1\\)`, 'g'), `url(#${to})`)
      .replace(new RegExp(`(href=")#${e}"`, 'g'), `$1#${to}"`);
  });
  charts.forEach((id, i) => {
    const to = `${prefix}-chart-${i + 1}`;
    h = h.replace(new RegExp(`(\\sdata-chart=")${esc(id)}"`, 'g'), `$1${to}"`);
    c = c.replace(new RegExp(`(\\[data-chart=["']?)${esc(id)}(["']?\\])`, 'g'), `$1${to}$2`);
  });
  return { html: h, css: c };
}

/** `rem` in inline styles → `px` (the stylesheet does the same): rem follows the host page's root font size. */
export const inlineRemToPx = (html) => html.replace(/(\sstyle=")([^"]*)"/g, (m, pre, css) => `${pre}${remToPx(css)}"`);

/** Throws if the markup could run code or point back into the app. */
export function assertStatic(html, name = 'fragment') {
  const problems = [
    [/<script\b/i, 'a <script>'],
    [/<(?:iframe|object|embed|link|template|astro-island)\b/i, 'an embedded or island element'],
    [/\son[a-z]+\s*=/i, 'an event handler attribute'],
    [/javascript:/i, 'a javascript: URL'],
    [/\/_astro\//, 'a reference to the app build'],
    [/\shref="(?!#)/i, 'a link'],
    [/\sdata-astro/i, 'an Astro attribute'],
  ].filter(([re]) => re.test(html)).map(([, what]) => what);
  if (problems.length) throw new Error(`${name} is not static: it contains ${problems.join(', ')}`);
  return html;
}

/** Text/data attribute for the wrapper. */
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** The fragment as it is written to disk: the wrapper (inert, hidden from assistive tech) around the markup. */
export function wrapFragment({ name, html, width, height }) {
  return `<!-- Generated by \`npm run fragments\` from the demo build. Do not edit. -->\n`
    + `<div class="${SCOPE_CLASS}" data-fragment="${attr(name)}" data-width="${width}" data-height="${height}" aria-hidden="true" inert>${html}</div>\n`;
}

/** @font-face rules of the app (from the pages' inline styles) for `vars`, renamed; plus the variables themselves. */
export function appFonts(faces, rootDecls, vars = FONT_VARS, prefix = FONT_PREFIX) {
  const rename = (family) => `"${prefix}${family.replace(/^["']|["']$/g, '').replace(/-[0-9a-f]{16}/, '')}"`;
  const values = {};
  for (const decl of rootDecls) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (m && vars.includes(m[1])) values[m[1]] = m[2].trim();
  }
  const missing = vars.filter((v) => !values[v]);
  if (missing.length) throw new Error(`App font variables not found: ${missing.join(', ')}`);
  const families = new Set(Object.values(values).flatMap((v) => v.split(',').map((f) => f.trim())));
  const files = [];
  const rules = faces.filter((f) => families.has(/font-family:\s*("[^"]+"|'[^']+'|[^;]+)/.exec(f)?.[1].trim())).map((f) => f
    .replace(/font-family:\s*("[^"]+"|'[^']+'|[^;]+)/, (m, fam) => `font-family:${rename(fam.trim())}`)
    .replace(/url\(["']?([^"')]+)["']?\)/g, (m, url) => { const file = path.posix.basename(url); files.push({ url, file }); return `url("fonts/${file}")`; }));
  const props = Object.entries(values).map(([k, v]) => `${k}:${v.split(',').map((f) => (families.has(f.trim()) && !/^(sans-serif|serif|monospace|cursive)$/.test(f.trim()) ? rename(f.trim()) : f.trim())).join(',')}`);
  return { faces: rules, props, files };
}

/**
 * Host page rules as specific as one class (`p`, `h2`, `button`, `* {}`) can't reach the fragments'
 * HTML: everything rolls back to the browser defaults first, then the app's rules apply (each is at
 * least as specific and comes later). SVG only gets its size limits and the text properties the
 * fragments never set as attributes back – `revert` would drop its presentation attributes (fill, width …).
 */
export const DESCENDANT_RESET = ':scope :where(:not(svg, svg *)){all:revert}'
  + ':scope :where(svg){max-width:none;max-height:none;min-width:0;min-height:0}'
  + ':scope :where(svg, svg *){letter-spacing:inherit;word-spacing:inherit;text-transform:inherit;font-style:inherit;text-shadow:inherit}';

/** Inherited properties reset on the wrapper, so nothing of the host page's text styles leaks in. */
export const WRAPPER_RESET = 'font:400 16px/1.5 sans-serif;font-variant:normal;letter-spacing:normal;word-spacing:normal;text-align:start;text-indent:0;text-transform:none;text-shadow:none;white-space:normal;direction:ltr;visibility:visible;cursor:default;hyphens:manual;word-break:normal;overflow-wrap:normal;list-style:none;color:var(--foreground)';

/** Manifest entry per piece, for the website's layout code (sizes in CSS px at the capture size). */
export function manifestEntry(piece, { width, height, url }) {
  return { name: piece.name, file: `${piece.name}.html`, width, height, anchor: piece.anchor, source: url, note: piece.note };
}

/** A static page showing every fragment and the map crop in the reader's colour scheme. */
export function previewPage(fragments, map) {
  const pieces = fragments.map((f) => `<section class="piece">
  <h2>${f.entry.name} <small>${f.entry.width}×${f.entry.height} · anchor ${f.entry.anchor} · ${f.entry.source}</small></h2>
  <p>${f.entry.note}</p>
  <div class="frame">${f.html.replace(/^<!--[^]*?-->\n/, '')}</div>
</section>`).join('\n');
  const mapSection = map ? `<section class="piece">
  <h2>${map.name} <small>${map.width}×${map.height} · anchor ${map.anchor} · ${map.source} · image</small></h2>
  <p>${map.note}</p>
  <div class="frame"><picture><source srcset="${map.dark}" media="(prefers-color-scheme: dark)"><img src="${map.light}" width="${map.width}" height="${map.height}" alt=""></picture></div>
</section>` : '';
  return `<!doctype html>
<!-- Generated by \`npm run fragments\`. Do not edit. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>UI fragments – preview</title>
<link rel="stylesheet" href="ui.css">
<style>
  :root { color-scheme: light; --page: #e9ebee; --page-ink: #1c2130; --page-muted: #5b6270; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --page: #0d1424; --page-ink: #e7eaf1; --page-muted: #9aa3b5; } }
  body { margin: 0; padding: 40px; background: var(--page); color: var(--page-ink); font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  main > p { margin: 0 0 40px; color: var(--page-muted); }
  .piece { margin: 0 0 56px; }
  .piece > h2 { margin: 0; font: 600 14px/1.4 ui-monospace, monospace; }
  .piece > h2 small { font-weight: 400; color: var(--page-muted); }
  .piece > p { margin: 2px 0 12px; color: var(--page-muted); font-size: 13px; }
  .frame { overflow-x: auto; }
  .frame > .ui-fragment, .frame > picture > img { display: block; width: max-content; padding: 24px; border-radius: 12px; background: var(--background, transparent); }
  .frame > picture > img { width: auto; max-width: 100%; height: auto; padding: 0; }
</style>
</head>
<body>
<main>
<h1>UI fragments</h1>
<p>Static copies of the demo build for the website – light or dark follows the system setting (or a <code>.dark</code> / <code>.light</code> class on an ancestor).</p>
${pieces}
${mapSection}
</main>
</body>
</html>
`;
}

/** Computed styles compared between the app and a fragment (plus each element's box relative to the piece). */
export const STYLE_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'font-variant-numeric', '-webkit-font-smoothing', 'padding-top', 'padding-left', 'margin-top', 'border-top-width', 'border-top-color', 'border-radius', 'display', 'gap', 'grid-template-columns', 'fill', 'stroke', 'opacity', 'box-shadow'];

/**
 * Runs in the page (self-contained): tag, box (relative to `root`) and STYLE_PROPS of `root` and
 * every element in it, in document order.
 */
export function snapshotStyles(root, props) {
  const r0 = root.getBoundingClientRect();
  return [root, ...root.querySelectorAll('*')].map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const box = [r.x - r0.x, r.y - r0.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(',');
    return [el.tagName.toLowerCase(), box, ...props.map((p) => cs.getPropertyValue(p))];
  });
}

/**
 * Differences between an app snapshot and a fragment snapshot (snapshotStyles), ignoring what is
 * renamed on purpose (font families, ids in url()) and empty boxes (SVG defs, titles).
 */
export function diffStyles(app, fragment, props = STYLE_PROPS) {
  const norm = (v) => String(v)
    .replace(/"?(Geist(?: Mono)?)-[0-9a-f]{16}( fallback: [^",]+)?"?/g, (m, family, fallback) => `"${family}${fallback ?? ''}"`)
    .replace(new RegExp(`"${FONT_PREFIX}`, 'g'), '"')
    .replace(/url\([^)]*\)/g, 'url()');
  const keys = ['tag', 'box', ...props];
  const diffs = [];
  if (app.length !== fragment.length) diffs.push(`element count ${app.length} ≠ ${fragment.length}`);
  for (let i = 0; i < Math.min(app.length, fragment.length); i++) {
    keys.forEach((k, j) => {
      if (k === 'box' && /,0,0$/.test(app[i][j]) && /,0,0$/.test(fragment[i][j])) return;
      if (norm(app[i][j]) !== norm(fragment[i][j])) diffs.push(`#${i} <${app[i][0]}> ${k}: ${app[i][j]} ≠ ${fragment[i][j]}`);
    });
  }
  return diffs;
}
