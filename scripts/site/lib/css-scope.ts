// Refs #46: turns the app's built stylesheet into one that only applies inside a wrapper element.
// Pure string work, no dependencies: a small parser for minified CSS (Tailwind/lightningcss output,
// no nesting), and the transforms that make it safe to load next to another site's styles.

const GROUP_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style', 'keyframes', '-webkit-keyframes', 'document']);
/** States a static, inert copy of the UI can never be in. Selectors using them are dropped. */
const INTERACTIVE = /:(?:hover|focus|focus-visible|focus-within|active|-moz-focusring|-moz-ui-invalid)(?![\w-])/;
/** Selectors for the document root – inside the scope they address the wrapper itself. */
const ROOT = /^(?::root|html|body|:host)$/;
/** Media features that describe the reader, not the layout – kept as media queries. */
const READER_MEDIA = /prefers-|forced-colors/;

/** A style rule: `selector{decls}`. */
export type CssRule = { type: 'rule'; selector: string; decls: string };
/** An at-rule: a group rule (`rules`), one with a declaration block (`decls`: @font-face, @property …) or a statement (neither). */
export type CssAtRule = { type: 'at'; name: string; prelude: string; rules?: CssNode[]; decls?: string };
export type CssNode = CssRule | CssAtRule;
/** A parsed stylesheet: its nodes plus the `/*! … *\/` licence banners. */
export type CssSheet = CssNode[] & { banners: string[] };

/** How scopeCss confines a stylesheet (see there). */
export type ScopeCssOptions = {
  /** Selector of the wrapper the styles apply inside. */
  scope: string;
  /** False for a selector no fragment uses: dropped. */
  used?: (selector: string) => boolean;
  /** Whether a layout media condition matches at the capture size (undefined: keep the query). */
  media?: (condition: string) => boolean | undefined;
  /** Root font size for `rem` → `px`. */
  base?: number;
  /** Declarations for the wrapper. */
  wrapper?: string;
  /** Rules before every app rule. */
  reset?: string;
};

type WalkContext = Required<Pick<ScopeCssOptions, 'used' | 'media' | 'base'>> & { global: CssAtRule[] };

/** Index of the first unquoted, unescaped `stops` character outside parentheses/brackets (or the end). */
function scan(text: string, i: number, stops: string): number {
  let depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { i = skipString(text, i); continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth <= 0 && stops.includes(c)) return i;
  }
  return i;
}

function skipString(text: string, i: number): number {
  const q = text[i];
  for (i++; i < text.length && text[i] !== q; i++) if (text[i] === '\\') i++;
  return i;
}

/** Index of the `}` closing the block that opens at `open`. */
function closeBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { i = skipString(text, i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error(`Unbalanced CSS block at ${open}`);
}

/** Comments outside strings removed; `/*! … *\/` banners (licences) returned separately. */
function stripComments(text: string): { css: string; banners: string[] } {
  let out = '';
  const banners: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { out += c + (text[i + 1] ?? ''); i++; continue; }
    if (c === '"' || c === "'") { const end = skipString(text, i); out += text.slice(i, end + 1); i = end; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      if (text[i + 2] === '!') banners.push(text.slice(i, stop));
      i = stop - 1;
      continue;
    }
    out += c;
  }
  return { css: out, banners };
}

/**
 * Parses a stylesheet into nodes:
 * `{ type: 'rule', selector, decls }`, `{ type: 'at', name, prelude, rules }` (group rules),
 * `{ type: 'at', name, prelude, decls }` (@font-face, @property …) and `{ type: 'at', name, prelude }` (statements).
 */
export function parseCss(text: string): CssSheet {
  const { css, banners } = stripComments(text);
  return Object.assign(parseList(css), { banners });
}

function parseList(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let i = 0;
  while (i < css.length) {
    const end = scan(css, i, '{;}');
    const head = css.slice(i, end).trim();
    if (end >= css.length || css[end] !== '{') {
      if (head.startsWith('@')) nodes.push(atNode(head));
      i = end + 1;
      continue;
    }
    const close = closeBrace(css, end);
    const body = css.slice(end + 1, close);
    if (head.startsWith('@')) {
      const node = atNode(head);
      if (GROUP_RULES.has(node.name)) node.rules = parseList(body);
      else node.decls = body.trim();
      nodes.push(node);
    } else {
      nodes.push({ type: 'rule', selector: head, decls: body.trim() });
    }
    i = close + 1;
  }
  return nodes;
}

function atNode(head: string): CssAtRule {
  const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(head);
  if (!m) throw new Error(`Invalid CSS at-rule: ${head}`);
  return { type: 'at', name: m[1], prelude: m[2].trim() };
}

/** Nodes back to (minified) CSS. */
export function serializeCss(nodes: readonly CssNode[]): string {
  return nodes.map((n) => {
    if (n.type === 'rule') return `${n.selector}{${n.decls}}`;
    const head = `@${n.name}${n.prelude ? ` ${n.prelude}` : ''}`;
    if (n.rules) return `${head}{${serializeCss(n.rules)}}`;
    if (n.decls !== undefined) return `${head}{${n.decls}}`;
    return `${head};`;
  }).join('');
}

/** `a, b:is(c, d)` → `['a', 'b:is(c, d)']` */
export function splitList(text: string, sep = ','): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i <= text.length) {
    const end = scan(text, i, sep);
    const part = text.slice(i, end).trim();
    if (part) parts.push(part);
    i = end + 1;
  }
  return parts;
}

/** Every selector of every style rule (outside @keyframes), for checking which ones the fragments use. */
export function collectSelectors(nodes: readonly CssNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type === 'rule') splitList(n.selector).forEach((s) => out.add(s));
    else if (n.rules && !/keyframes$/.test(n.name)) collectSelectors(n.rules, out);
  }
  return out;
}

/** Every @media condition that depends on the layout (viewport), to be resolved at the capture size. */
export function collectMedia(nodes: readonly CssNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type !== 'at' || !n.rules) continue;
    if (n.name === 'media' && !READER_MEDIA.test(n.prelude)) out.add(n.prelude);
    collectMedia(n.rules, out);
  }
  return out;
}

/** True for selectors that only apply in an interactive state (hover, focus …). */
export const isInteractive = (selector: string): boolean => INTERACTIVE.test(selector);

/** `1.5rem` → `24px`: rem follows the host page's root font size, the fragments must not. */
export function remToPx(value: string, base = 16): string {
  return value.replace(/(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+))rem(?![\w-])/g, (_m, pre: string, n: string) => `${pre}${+(Number(n) * base).toFixed(4)}px`);
}

/** Inserts `cond` before a trailing pseudo-element (`a::before` + `:x` → `a:x::before`). */
function onSubject(selector: string, cond: string): string {
  const m = /(::?(?:before|after|backdrop|placeholder|marker|selection|file-selector-button|first-line|first-letter))$/.exec(selector);
  return m ? selector.slice(0, -m[1].length) + cond + m[1] : selector + cond;
}

const DARK = ':is(.dark *)';
const AUTO = ':not(.light *)';

/**
 * One app selector inside the scope. Returns the selector for an explicit `.dark` ancestor (`forced`)
 * and, for dark-only selectors, the one for the reader's system preference (`auto`, used inside
 * `@media (prefers-color-scheme: dark)` unless a `.light` ancestor opts out).
 * Every selector gets an explicit `:scope` – one extra class of specificity, the same for all rules –
 * so descendant rules of the host page (`.section p`) don't win over the app's utilities.
 */
export function scopeSelector(selector: string): { forced: string; auto: string | null } {
  const s = selector.trim();
  if (ROOT.test(s)) return { forced: ':scope', auto: null };
  if (s === '.dark') return { forced: ':scope:is(.dark, .dark *)', auto: ':scope:not(.light, .light *)' };
  const dark = s.startsWith('.dark ') ? onSubject(s.slice(6).trim(), DARK) : s;
  if (!dark.includes(DARK)) return { forced: `:scope ${s}`, auto: null };
  return { forced: `:scope ${dark}`, auto: `:scope ${dark.split(DARK).join(AUTO)}` };
}

/** Removes the named properties from a declaration block. */
export function dropDecls(decls: string, names: readonly string[]): string {
  return splitList(decls, ';').filter((d) => !names.includes(d.slice(0, d.indexOf(':')).trim().toLowerCase())).join(';');
}

/**
 * The app stylesheet, confined to `scope`:
 * - cascade layers flattened in order (unlayered host styles would otherwise beat every app rule)
 * - viewport media queries resolved for the capture size (`media(cond)` → true/false), so the
 *   fragments keep the layout they were captured with at any width; reader preferences stay queries
 * - unused selectors (`used(selector)` false) and interactive states dropped, `rem` → `px`
 * - `:root`/`html`/`body` → the wrapper (without the page background), dark mode via a `.dark`
 *   ancestor or the system preference (a `.light` ancestor forces light)
 * - @property and @font-face hoisted out of the scope; @keyframes dropped (the fragments are static)
 * `wrapper`: declarations for the wrapper, `reset`: rules – both before every app rule.
 */
export function scopeCss(nodes: readonly CssNode[], { scope, used = () => true, media = () => undefined, base = 16, wrapper = '', reset = '' }: ScopeCssOptions): string {
  const global: CssAtRule[] = [];
  const scoped = (wrapper ? `:scope{${wrapper}}` : '') + reset + serializeCss(walk(nodes, { used, media, base, global }));
  // Registered custom properties only for the ones the kept rules still use
  const hoisted = global.filter((n) => n.name !== 'property' || new RegExp(`${n.prelude}(?![\\w-])`).test(scoped));
  return `${serializeCss(hoisted)}@scope (${scope}){${scoped}}`;
}

function walk(nodes: readonly CssNode[], ctx: WalkContext): CssNode[] {
  const out: CssNode[] = [];
  for (const n of nodes) {
    if (n.type === 'rule') { out.push(...scopeRule(n, ctx)); continue; }
    if (n.name === 'property' || n.name === 'font-face') { ctx.global.push({ ...n, decls: remToPx(n.decls ?? '', ctx.base) }); continue; }
    if (!n.rules || /keyframes$/.test(n.name)) continue; // statements (@layer a, b;  @charset) and @keyframes
    if (n.name === 'layer') { out.push(...walk(n.rules, ctx)); continue; }
    if (n.name === 'media' && !READER_MEDIA.test(n.prelude)) {
      const matches = ctx.media(n.prelude);
      if (matches === true) { out.push(...walk(n.rules, ctx)); continue; }
      if (matches === false) continue;
    }
    const rules = walk(n.rules, ctx);
    if (rules.length) out.push({ ...n, rules });
  }
  return out;
}

function scopeRule(rule: CssRule, ctx: WalkContext): CssNode[] {
  const selectors = splitList(rule.selector).filter((s) => !isInteractive(s) && (ROOT.test(s) || s === '.dark' || ctx.used(s)));
  if (!selectors.length) return [];
  const decls = remToPx(rule.decls, ctx.base);
  const roots = selectors.filter((s) => ROOT.test(s));
  const rest = selectors.filter((s) => !ROOT.test(s));
  const out: CssNode[] = [];
  // The wrapper keeps the host page's background: the app paints its canvas on <body>
  if (roots.length) out.push({ type: 'rule', selector: ':scope', decls: dropDecls(decls, ['background', 'background-color']) });
  if (!rest.length) return out;
  const scoped = rest.map(scopeSelector);
  const auto = scoped.map((s) => s.auto).filter((s) => s !== null && s !== '');
  out.push({ type: 'rule', selector: scoped.map((s) => s.forced).join(','), decls });
  if (auto.length) out.push({ type: 'at', name: 'media', prelude: '(prefers-color-scheme:dark)', rules: [{ type: 'rule', selector: auto.join(','), decls }] });
  return out;
}
