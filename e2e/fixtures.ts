import { test as base, type Page } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

/**
 * Resolves once every island of the current page has hydrated: each island root bumps
 * `<html data-hydrated>` after its first commit (`src/lib/island-ready.ts`). Before that, the server
 * HTML is visible but inert – a fill, hover or click is lost (no handlers attached yet).
 */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => document.readyState !== 'loading'
    && Number(document.documentElement.dataset.hydrated ?? 0) >= document.querySelectorAll('astro-island').length);
}

type Goto = Page['goto'];
type History = Page['goBack'];

/**
 * `page.goto`, `goBack`, `goForward` and `reload` wait for hydration as well, so a test never acts
 * on a page whose islands are still inert. `waitUntil: 'commit' | 'domcontentloaded'` opts out –
 * for checks of the state before the first paint.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const early = (options?: { waitUntil?: string }) => options?.waitUntil === 'commit' || options?.waitUntil === 'domcontentloaded';
    const goto = page.goto.bind(page);
    page.goto = (async (url, options) => {
      const res = await goto(url, options);
      if (!early(options)) await hydrated(page);
      return res;
    }) as Goto;
    for (const name of ['goBack', 'goForward', 'reload'] as const) {
      const nav = page[name].bind(page);
      page[name] = (async (options) => {
        const res = await nav(options);
        if (!early(options)) await hydrated(page);
        return res;
      }) as History;
    }
    await use(page);
  },
});
