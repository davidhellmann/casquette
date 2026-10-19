import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_PNGS, WEBSITE_COPIES, brandFiles } from '../scripts/site/lib/brand-assets.ts';
import { CAP, WORDMARK, capPlacement } from './lib/brand.ts';

// Refs #27: every brand consumer exists and is generated from the one brand source
// (src/lib/brand.ts) – after changing the logo, `npm run brand` regenerates them all.
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file));

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe('brand assets', () => {
  it.each(Object.entries(brandFiles()))('%s is up to date with the brand source', (file, content) => {
    expect(read(file).toString()).toBe(content);
  });

  it('every PNG exists in its rendered size', () => {
    expect(Object.keys(BRAND_PNGS).sort()).toEqual([
      'brand/casquette-logo-dark.png', 'brand/casquette-logo-light.png', 'public/apple-touch-icon.png', 'public/og.png',
    ]);
    for (const [file, { width, height, scale }] of Object.entries(BRAND_PNGS)) {
      expect(pngSize(read(file)), file).toEqual({ width: width * scale, height: height * scale });
    }
  });

  it.each(Object.entries(WEBSITE_COPIES))('the website copy %s equals %s', (copy, source) => {
    expect(read(copy).equals(read(source))).toBe(true);
  });

  it('the README header shows the logo PNGs', () => {
    const readme = read('README.md').toString();
    expect(readme).toContain('srcset="brand/casquette-logo-dark.png"');
    expect(readme).toContain('src="brand/casquette-logo-light.png"');
  });
  it('no current brand file carries the old name (explorations excepted)', () => {
    const files = [
      ...fs.readdirSync(path.join(ROOT, 'brand'), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => `brand/${f.name}`),
      'public/favicon.svg',
      ...Object.keys(WEBSITE_COPIES), 'website/favicon.svg',
    ];
    for (const file of files) {
      expect(file).not.toMatch(/sdb/i);
      expect(read(file).toString(), file).not.toMatch(/\bSDB\b/);
    }
  });
});

describe('the approved logo', () => {
  it('is the Damion word with the original cap sketch, stroke 2.4, stripe × 1.3', () => {
    expect(WORDMARK).toMatchObject({ font: 'Damion', text: 'casquette', stop: '.' });
    expect(CAP.viewBox).toBe('-2 -2 48 36');
    expect(CAP.outline).toBe('M6 21C6 10 14 4 23 4C32 4 37 10 37 18M6 21C14 23.5 28 23.5 37 18M37 18C39.5 17.4 41.5 17.8 42.5 19.2C40 22.6 33 25.2 25 25.6');
    expect(CAP.stripe).toBe('M19.5 4.6C17.6 9.5 17.3 16.5 18.1 23.2');
    expect([CAP.stroke, CAP.stripeFactor]).toEqual([2.4, 1.3]);
  });

  it('places the cap with the approved formula (approval sheet at 72 px: c box top −14 px)', () => {
    const p = capPlacement({ cTop: -14 / 72, cLeft: 0 });
    expect(p.left * 72).toBeCloseTo(-23.6736, 3);
    expect(p.top * 72).toBeCloseTo(-17.5856, 3);
    expect(p.width * 72).toBeCloseTo(67.392, 3);
    expect([p.rotate, p.origin]).toEqual([-19, '30% 90%']);
  });
});

// The promo website (website/, plain HTML/CSS without a build) can't import the brand source, so
// its copy of the logo is checked against it here: same font file, same cap, same placement.
describe('the website logo', () => {
  const html = read('website/index.html').toString();
  const css = read('website/site.css').toString();
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  const em = (v: number) => `${Math.round(v * 10000) / 10000}em`;

  it('is set in the app\'s Damion file', () => {
    expect(read('website/fonts/damion-latin.woff2').equals(read('node_modules/@fontsource/damion/files/damion-latin-400-normal.woff2'))).toBe(true);
    expect(css).toMatch(/font-family: 'Damion';[^}]*font-display: block;[^}]*url\(fonts\/damion-latin\.woff2\)/);
  });

  it('every logo is the word, the pink full stop and the cap with the brand paths', () => {
    const logos = [...html.matchAll(/<a class="logo"[^>]*>(.*?)<\/a>/g)].map((m) => m[1]);
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      expect(logo).toContain(`<span>${WORDMARK.text[0]}</span>${WORDMARK.text.slice(1)}<span class="logo-stop">${WORDMARK.stop}</span>`);
      expect(logo).toContain(`<svg class="logo-cap" viewBox="${CAP.viewBox}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
      expect(logo).toContain(`<path d="${CAP.outline}" stroke="currentColor" stroke-width="${CAP.stroke}"/>`);
      expect(logo).toContain(`<path d="${CAP.stripe}" stroke="var(--brand)" stroke-width="${Math.round(CAP.stroke * CAP.stripeFactor * 100) / 100}"/>`);
    }
  });

  it('places the cap at the approved formula\'s offsets, like AppLogo', () => {
    const p = capPlacement();
    const cap = rule('.logo-cap');
    expect(cap).toContain(`left: ${em(p.left)}; top: ${em(p.top)}; width: ${em(p.width)}; height: ${em(p.height)};`);
    expect(cap).toContain(`transform: rotate(${p.rotate}deg); transform-origin: ${p.origin};`);
    expect(rule('.logo')).toContain(`padding-left: ${em(-p.left)};`);
    expect(rule('.logo')).toMatch(/font: 400 \d+px\/1 var\(--font-logo\)/);
    expect(rule('.logo-stop')).toContain('color: var(--brand);');
  });
});
