// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { collectMedia, collectSelectors, dropDecls, isInteractive, parseCss, remToPx, scopeCss, scopeSelector, serializeCss, splitList } from './css-scope.ts';

describe('parseCss / serializeCss', () => {
  it('round-trips minified CSS with layers, at-rules, escapes and strings', () => {
    const css = '@layer theme,base;@layer base{*,:before{margin:0}}.\\[\\&_a\\]\\:underline a{text-decoration:underline}'
      + '@media (width>=40rem){.sm\\:grid{display:grid}}.x:after{content:"{;}"}@font-face{font-family:A;src:url(a.woff2)}@keyframes k{0%{opacity:0}to{opacity:1}}';
    expect(serializeCss(parseCss(css))).toBe(css);
  });

  it('parses rules, group rules, declaration at-rules and statements', () => {
    const nodes = parseCss('@layer a, b;@media (hover:hover){.a:hover{color:red}}@property --x{syntax:"*";inherits:false}.b{color:blue}');
    expect(nodes.map((n) => n.type === 'rule' ? n.selector : `@${n.name}`)).toEqual(['@layer', '@media', '@property', '.b']);
    expect(nodes[1].rules[0]).toEqual({ type: 'rule', selector: '.a:hover', decls: 'color:red' });
    expect(nodes[2].decls).toBe('syntax:"*";inherits:false');
  });

  it('drops comments but keeps licence banners', () => {
    const nodes = parseCss('/*! lib v1 | MIT */\n/* note */.a{color:red/* inline */}');
    expect(nodes.banners).toEqual(['/*! lib v1 | MIT */']);
    expect(serializeCss(nodes)).toBe('.a{color:red}');
  });
});

describe('selectors', () => {
  it('splits lists only at top-level commas', () => {
    expect(splitList('a, b:is(c, d), [x="1,2"]')).toEqual(['a', 'b:is(c, d)', '[x="1,2"]']);
    expect(splitList('color:red;background:url(a;b)', ';')).toEqual(['color:red', 'background:url(a;b)']);
  });

  it('collects selectors outside keyframes and the layout media queries', () => {
    const nodes = parseCss('@layer x{.a,.b{c:d}}@keyframes k{0%{o:0}}@media (width>=40rem){.c{d:e}}@media (prefers-reduced-motion:reduce){.d{e:f}}');
    expect([...collectSelectors(nodes)]).toEqual(['.a', '.b', '.c', '.d']);
    expect([...collectMedia(nodes)]).toEqual(['(width>=40rem)']);
  });

  it('recognises interactive states', () => {
    expect(isInteractive('.hover\\:bg:hover')).toBe(true);
    expect(isInteractive('.x:focus-visible')).toBe(true);
    expect(isInteractive('.x:focus-within')).toBe(true);
    expect(isInteractive('.x[data-state=open]')).toBe(false);
    expect(isInteractive('.\\:hover-like')).toBe(false);
  });

  it('scopes selectors with one extra :scope and maps the document root to the wrapper', () => {
    expect(scopeSelector('.a .b')).toEqual({ forced: ':scope .a .b', auto: null });
    expect(scopeSelector('*')).toEqual({ forced: ':scope *', auto: null });
    for (const root of [':root', 'html', 'body', ':host']) expect(scopeSelector(root).forced).toBe(':scope');
  });

  it('turns dark mode into a .dark ancestor or the system preference (unless .light)', () => {
    expect(scopeSelector('.dark')).toEqual({ forced: ':scope:is(.dark, .dark *)', auto: ':scope:not(.light, .light *)' });
    expect(scopeSelector('.dark\\:bg-x:is(.dark *)')).toEqual({ forced: ':scope .dark\\:bg-x:is(.dark *)', auto: ':scope .dark\\:bg-x:not(.light *)' });
    expect(scopeSelector('.dark [data-chart=c1]')).toEqual({ forced: ':scope [data-chart=c1]:is(.dark *)', auto: ':scope [data-chart=c1]:not(.light *)' });
    expect(scopeSelector('.dark .x::before').forced).toBe(':scope .x:is(.dark *)::before');
  });
});

describe('remToPx / dropDecls', () => {
  it('converts rem to px at 16 px, leaving other units and identifiers alone', () => {
    expect(remToPx('padding:.25rem 1.5rem;margin:-2rem;--spacing:0.25rem')).toBe('padding:4px 24px;margin:-32px;--spacing:4px');
    expect(remToPx('width:3em;--x-rem:1;font:1rem/1.5 a')).toBe('width:3em;--x-rem:1;font:16px/1.5 a');
  });

  it('drops the named declarations', () => {
    expect(dropDecls('color:red;background-color:var(--x);font:a', ['background-color'])).toBe('color:red;font:a');
  });
});

describe('scopeCss', () => {
  const run = (css, opts = {}) => scopeCss(parseCss(css), { scope: '.ui', ...opts });

  it('flattens layers in order and wraps everything in @scope', () => {
    expect(run('@layer a,b;@layer a{.x{c:1}}@layer b{.y{c:2}}')).toBe('@scope (.ui){:scope .x{c:1}:scope .y{c:2}}');
  });

  it('resolves layout media queries and keeps reader preferences', () => {
    const css = '@media (width>=40rem){.a{c:1}}@media (width>=96rem){.b{c:2}}@media (orientation:portrait){.c{c:3}}@media (prefers-reduced-motion:reduce){.d{c:4}}';
    const media = (m) => ({ '(width>=40rem)': true, '(width>=96rem)': false })[m];
    expect(run(css, { media })).toBe('@scope (.ui){:scope .a{c:1}@media (orientation:portrait){:scope .c{c:3}}@media (prefers-reduced-motion:reduce){:scope .d{c:4}}}');
  });

  it('drops unused selectors, interactive states and empty rules', () => {
    const used = (s) => s !== '.unused';
    expect(run('.a,.unused{c:1}.unused{c:2}.b:hover{c:3}@supports (x:y){.unused{c:4}}', { used })).toBe('@scope (.ui){:scope .a{c:1}}');
  });

  it('maps the root to the wrapper without the page background and adds the wrapper declarations first', () => {
    expect(run(':root,:host{--a:1}body{background-color:var(--sidebar);color:var(--fg)}', { wrapper: 'font:16px a', reset: ':scope *{all:revert}' }))
      .toBe('@scope (.ui){:scope{font:16px a}:scope *{all:revert}:scope{--a:1}:scope{color:var(--fg)}}');
  });

  it('adds a system-preference copy of every dark rule', () => {
    expect(run('.dark{--bg:#000}')).toBe('@scope (.ui){:scope:is(.dark, .dark *){--bg:#000}@media (prefers-color-scheme:dark){:scope:not(.light, .light *){--bg:#000}}}');
  });

  it('hoists the @property rules still in use and @font-face out of the scope, drops @keyframes, converts rem', () => {
    const css = '@property --tw-a{syntax:"*";inherits:false}@property --tw-unused{syntax:"*";inherits:false}@font-face{font-family:A;src:url(a.woff2)}'
      + '@keyframes spin{to{rotate:1turn}}.x{margin:var(--tw-a);padding:1rem}';
    expect(run(css)).toBe('@property --tw-a{syntax:"*";inherits:false}@font-face{font-family:A;src:url(a.woff2)}@scope (.ui){:scope .x{margin:var(--tw-a);padding:16px}}');
  });
});
