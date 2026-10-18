import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { legalLinks } from '../../lib/legal-links.ts';

// Refs #55: with PUBLIC_LEGAL_URL (the hosted demo) the sidebar footer links to the website's legal
// pages; without it (self-hosted copies) nothing is shown. The e2e build has no PUBLIC_LEGAL_URL:
// e2e/legal-links.spec.ts checks the empty case in the browser.
const render = (legal?: { notice: string; privacy: string }) =>
  renderToStaticMarkup(createElement(AppShell, { active: 'dashboard', crumbs: [{ label: 'Dashboard' }], legal }));

describe('sidebar footer: legal links', () => {
  it('shows "Legal notice · Privacy policy" to the site when set', () => {
    const html = render(legalLinks('https://example.com/')!);
    expect(html).toContain('data-legal-links');
    expect(html).toContain('<a href="https://example.com/legal-notice.html" class="hover:text-foreground hover:underline">Legal notice</a>');
    expect(html).toContain('<a href="https://example.com/privacy-policy.html" class="hover:text-foreground hover:underline">Privacy policy</a>');
    expect(html).toMatch(/<ul aria-label="Legal"/);
  });

  it('shows nothing when unset', () => {
    const html = render(legalLinks(undefined) ?? undefined);
    expect(html).not.toContain('data-legal-links');
    expect(html).not.toMatch(/Legal notice|Privacy policy/);
  });
});
