import type { Page } from '@playwright/test';

/** Pages that exist under a fixed URL. */
export const STATIC_PAGES = ['/', '/rides/', '/years/', '/map/', '/performance/', '/segments/', '/gear/'];

/** Detail routes, each reached through the first matching link on a page that lists them. */
export const DETAIL_PAGES = [
  { name: 'ride', index: '/performance/', link: /\/rides\/[^/]+\/?$/ },
  { name: 'year', index: '/years/', link: /\/years\/\d{4}\/?$/ },
  { name: 'segment', index: '/segments/', link: /\/segments\/[^/]+\/?$/ },
  { name: 'bike', index: '/gear/', link: /\/gear\/[^/]+\/?$/ },
];

/** href of the first link on the current page whose path matches `pattern`. */
export async function firstLink(page: Page, pattern: RegExp) {
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  const href = hrefs.find((h) => pattern.test(h));
  if (!href) throw new Error(`No link matching ${pattern} on ${page.url()}`);
  return href;
}
