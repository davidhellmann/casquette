// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { legalLinks } from './legal-links.ts';

// Refs #55: the hosted demo links to the website's legal pages; self-hosted copies show nothing.
describe('legalLinks', () => {
  it('is null when PUBLIC_LEGAL_URL is unset or empty', () => {
    expect(legalLinks(undefined)).toBeNull();
    expect(legalLinks(null)).toBeNull();
    expect(legalLinks('  ')).toBeNull();
  });

  it('points to the two pages at the site origin, with or without a trailing slash', () => {
    const pages = { notice: 'https://example.com/legal-notice.html', privacy: 'https://example.com/privacy-policy.html' };
    expect(legalLinks('https://example.com/')).toEqual(pages);
    expect(legalLinks('https://example.com')).toEqual(pages);
    expect(legalLinks(' https://example.com/?x=1#top ')).toEqual(pages);
  });

  it('keeps a project path (GitHub Pages without a custom domain)', () => {
    expect(legalLinks('https://jane.github.io/casquette')).toEqual({
      notice: 'https://jane.github.io/casquette/legal-notice.html',
      privacy: 'https://jane.github.io/casquette/privacy-policy.html',
    });
  });

  it('fails on anything but an http(s) URL', () => {
    for (const bad of ['example.com', '/legal', 'javascript:alert(1)', 'ftp://example.com/']) {
      expect(() => legalLinks(bad), bad).toThrow(/PUBLIC_LEGAL_URL/);
    }
  });
});
