import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Refs #45: the website frame – loads cleanly from its own folder, light and dark, accessible.
// Plain @playwright/test: the website has no islands, so the app's hydration fixtures don't apply.

const REPO = 'https://github.com/davidhellmann/casquette';

/** Collects console errors, page errors, failed and off-site requests while `page` is used. */
function watch(page: Page, origin: string) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
  page.on('request', (r) => { if (new URL(r.url()).origin !== origin) problems.push(`off-site: ${r.url()}`); });
  return problems;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('loads without errors, self-hosted fonts only', async ({ page, baseURL }) => {
      const problems = watch(page, new URL(baseURL!).origin);
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // The site's own fonts; the UI fragments' fonts (ui/ui.css: "Casquette UI …", with local()
      // system-font metric fallbacks) load for the hero (#47) and once a feature shot is near (#48)
      const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
      expect(new Set(loaded.filter((f) => !f.startsWith('Casquette UI ') && !f.includes(' fallback: ')))).toEqual(new Set(['Gabarito', 'Damion', 'Geist Mono']));
      expect(problems).toEqual([]);
    });

    test('has no accessibility violations', async ({ page }) => {
      // Reduced motion: every block in its final state (scroll reveals would still be faded out)
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/', { waitUntil: 'networkidle' });
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  });
}

test('light and dark follow the system preference', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await background()).toBe('rgb(238, 240, 243)');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background()).toBe('rgb(13, 20, 36)');
});

test('theme switch: Light, Dark, Auto – Dark by default, every choice stored under rc_site_theme, no flash', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const stored = () => page.evaluate(() => localStorage.getItem('rc_site_theme'));
  const LIGHT = 'rgb(238, 240, 243)', DARK = 'rgb(13, 20, 36)';
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear()); // the config seeds "auto"
  await page.reload();
  const group = page.getByRole('navigation', { name: 'Main' }).getByRole('group', { name: 'Theme' });
  await expect(group).toBeVisible();
  const choice = (name: string) => group.getByRole('button', { name, exact: true });
  const pressed = () => group.getByRole('button').evaluateAll((bs) => bs.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label')));
  await expect(group.getByRole('button')).toHaveCount(3);
  // Default: Dark – also on a light system, nothing stored; the app's key doesn't count
  expect(await pressed()).toEqual(['Dark']);
  expect(await stored()).toBeNull();
  expect(await background()).toBe(DARK);
  await page.evaluate(() => localStorage.setItem('rc_theme', 'light'));
  await page.reload();
  expect(await background()).toBe(DARK);

  // Light – page, real UI fragments, map crop, browser chrome
  await choice('Light').click();
  expect(await pressed()).toEqual(['Light']);
  expect(await stored()).toBe('light');
  expect(await background()).toBe(LIGHT);
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  const panel = page.locator('#hero .hero-panel .ui-fragment').first();
  await expect(panel).toHaveCount(1);
  expect(await panel.evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim())).toBe('#f7f8f9');
  await expect(page.locator('#map .map-light')).toBeVisible();
  await expect(page.locator('#map .map-dark')).toBeHidden();
  for (const content of await page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => m.getAttribute('content')))) expect(content).toBe('#eef0f3');

  // Remembered, applied before the first paint
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('body');
  expect(await page.evaluate(() => document.documentElement.className)).toContain('light');
  expect(await background()).toBe(LIGHT);
  expect(await pressed()).toEqual(['Light']);

  // Dark
  await choice('Dark').click();
  expect(await stored()).toBe('dark');
  expect(await background()).toBe(DARK);
  await expect(page.locator('#map .map-dark')).toBeVisible();

  // Auto follows the system, live
  await page.emulateMedia({ colorScheme: 'light' });
  await choice('Auto').click();
  expect(await stored()).toBe('auto');
  expect(await pressed()).toEqual(['Auto']);
  expect(await background()).toBe(LIGHT);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background()).toBe(DARK);
  const metas = await page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => m.getAttribute('content')));
  expect(metas).toEqual(['#eef0f3', '#0d1424']);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, colorScheme: 'light', storageState: { cookies: [], origins: [] } });
  test('the website is dark', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(13, 20, 36)');
  });
});

test('theme switch stays in reach on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // Get started stays on one line next to it
  const cta = page.locator('.nav-cta');
  expect(await cta.evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 40)).toBe(true);
});

test('social preview: absolute URLs on casquette.es, og.png is 1200 × 630 (npm run og)', async ({ page }) => {
  await page.goto('/');
  const meta = (sel: string) => page.locator(sel).getAttribute('content');
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe('https://casquette.es/');
  expect(await meta('meta[property="og:url"]')).toBe('https://casquette.es/');
  expect(await meta('meta[property="og:image"]')).toBe('https://casquette.es/og.png');
  expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(await meta('meta[property="og:image:alt"]')).toContain('dashboard');
  // The file itself: a PNG of the size the tags announce (IHDR: width, height at bytes 16–23)
  const png = readFileSync(new URL('../website/og.png', import.meta.url));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([Number(await meta('meta[property="og:image:width"]')), Number(await meta('meta[property="og:image:height"]'))]);
  expect(existsSync(new URL('../scripts/site/og/template.html', import.meta.url))).toBe(true);
});

test('every repository place (data-repo) points to the repository', async ({ page }) => {
  await page.goto('/');
  const places = await page.locator('[data-repo]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? el.textContent ?? ''));
  expect(places.length).toBeGreaterThanOrEqual(3);
  for (const place of places) expect(place).toContain(REPO);
});

for (const width of [390, 1440, 2560]) {
  test(`no horizontal scroll at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('scroll reveal: hidden until in view, then revealed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const privacy = page.locator('#privacy .reveal');
  await expect(privacy).not.toHaveClass(/\bin\b/);
  await privacy.scrollIntoViewIfNeeded();
  await expect(privacy).toHaveClass(/\bin\b/);
  await expect(privacy).toHaveCSS('opacity', '1');
});

test('reduced motion: everything is shown in its final state at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const el of await page.locator('.reveal, .slide-in').all()) {
    await expect(el).toHaveCSS('opacity', '1');
    await expect(el).toHaveCSS('transform', 'none');
  }
});

// Refs #49: privacy panel, what you need, the four steps and the footer.

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
/** The commands in the README "Quick start" code blocks, without comments. */
const QUICK_START = (README.split('## Quick start')[1] ?? '').split('\n## ')[0]
  .match(/```bash\n([\s\S]*?)```/g)!
  .flatMap((block) => block.split('\n').slice(1, -1))
  .map((line) => line.replace(/#.*$/, '').trim())
  .filter(Boolean);

test('privacy panel: stays on your disk', async ({ page }) => {
  await page.goto('/');
  const privacy = page.locator('#privacy');
  await expect(privacy.getByRole('heading', { level: 2 })).toHaveText('Your rides stay home.');
  await expect(privacy).toContainText('Every ride is a plain file on your computer. No sign-up, no cloud, no one else’s server. Delete the folder and it’s gone.');
});

test('what you need: four chips, the two to get linked – technical, no hand-holding', async ({ page }) => {
  await page.goto('/');
  const needs = page.getByRole('list', { name: 'What you need' });
  const node = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines.node.match(/(\d+\.\d+)/)[1];
  await expect(needs.getByRole('listitem')).toHaveText(['Strava subscription', `Node.js ${node}+`, 'Git · terminal', '~10 min setup']);
  expect(README).toContain(`Node.js ${node} or newer`);
  await expect(needs.getByRole('link', { name: 'Strava subscription' })).toHaveAttribute('href', 'https://www.strava.com/subscribe');
  await expect(needs.getByRole('link', { name: `Node.js ${node}+` })).toHaveAttribute('href', 'https://nodejs.org/en/download');
  expect(README).toContain('since June 2026 Strava only lets subscribers');
  // Nothing for people who don't know Git: no ZIP, no operating systems, no Git download
  for (const word of [/zip/i, /windows/i, /macos/i, /linux/i, /git-scm/i, /command prompt/i]) await expect(page.locator('#get')).not.toContainText(word);
  // Hosting: one line below the steps
  const note = page.locator('#get .start-note');
  await expect(note).toContainText('Only behind a password');
  await expect(note.getByRole('link', { name: 'Building and hosting' })).toHaveAttribute('href', `${REPO}#building-and-hosting`);
  await expect(note.getByRole('link', { name: 'the README' })).toHaveAttribute('href', `${REPO}#quick-start`);
  expect(README).toContain('## Building and hosting');
});

test('four steps: Clone, Look around, Connect, Sync – each with an icon and its commands as in the README', async ({ page }) => {
  await page.goto('/');
  const steps = page.locator('#get .steps > li');
  await expect(steps.getByRole('heading', { level: 3 })).toHaveText(['Clone', 'Look around', 'Connect', 'Sync']);
  for (const step of await steps.all()) await expect(step.locator('.step-ico svg')).toHaveCount(1);
  const lines = async (i: number) => (await steps.nth(i).locator('.cmd-line').allTextContents()).map((l) => l.trim());
  expect(await lines(0)).toEqual([`git clone ${REPO}.git`, 'cd casquette']);
  expect(await lines(1)).toEqual(['npm ci && npm run dev']);
  expect(await lines(2)).toEqual(['cp .env.example .env', 'npm run strava:auth']);
  expect(await lines(3)).toEqual(['npm run sync:all']);
  for (const i of [1, 2, 3]) {
    for (const line of await lines(i)) for (const part of line.split('&&').map((c) => c.trim())) expect(QUICK_START, part).toContain(part);
  }
  await expect(steps.nth(3).locator('.cmd-note')).toHaveText('# later: npm run sync');
  expect(README).toContain('run `npm run sync` whenever');
  await expect(steps.nth(2).getByRole('link', { name: 'your API app' })).toHaveAttribute('href', 'https://www.strava.com/settings/api');
  expect(README).toContain('https://www.strava.com/settings/api');
});

for (const width of [1440, 390]) {
  test(`every command stays on one line (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const heights = await page.locator('#get .cmd-line').evaluateAll((els) => els.map((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return el.getBoundingClientRect().height / lh;
    }));
    for (const h of heights) expect(h).toBeLessThan(1.5);
    // Long lines scroll inside their block, the page never does
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('copy buttons copy their step\'s commands (not the prompt or the notes) and say so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const status = page.locator('[data-copy-status]');
  await expect(status).toHaveAttribute('role', 'status');
  for (const [name, text] of [
    ['Copy the clone command', `git clone ${REPO}.git\ncd casquette`],
    ['Copy the demo command', 'npm ci && npm run dev'],
    ['Copy the connect command', 'cp .env.example .env\nnpm run strava:auth'],
    ['Copy the sync command', 'npm run sync:all'],
  ] as const) {
    const button = page.getByRole('button', { name });
    await expect(button).toBeVisible();
    await button.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await expect(button).toHaveClass(/\bcopied\b/);
    await expect(status).toHaveText(`Copied: ${text.replace(/\n/g, ', ')}`);
  }
  // Keyboard: focusable and works with Enter
  await page.getByRole('button', { name: 'Copy the demo command' }).focus();
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm ci && npm run dev');
  await expect(page.getByRole('button', { name: 'Copy the sync command' })).not.toHaveClass(/\bcopied\b/, { timeout: 4000 });
});

test('copy buttons still copy when the Clipboard API refuses, and the tick stays three seconds', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // As in embedded webviews or without the permission: writeText rejects, execCommand has to do it
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Copy the connect command' });
  await button.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('cp .env.example .env\nnpm run strava:auth');
  await expect(button).toHaveClass(/\bcopied\b/);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  await page.waitForTimeout(2500);
  await expect(button).toHaveClass(/\bcopied\b/);
  await expect(button).not.toHaveClass(/\bcopied\b/, { timeout: 1500 });
});

test('copy works inside the click itself – also where a late fallback would be refused', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Safari, Firefox and embedded webviews only allow execCommand('copy') during the click: a
  // fallback after an async rejection is too late. Emulate that – copy counts only while the click
  // handler runs – and a Clipboard API that never settles.
  await page.addInitScript(() => {
    let inClick = false;
    document.addEventListener('click', () => { inClick = true; setTimeout(() => { inClick = false; }); }, true);
    const exec = document.execCommand.bind(document);
    document.execCommand = (cmd: string, ...rest: unknown[]) => (cmd === 'copy' && !inClick ? false : exec(cmd, ...(rest as [])));
    navigator.clipboard.writeText = () => new Promise(() => {});
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Copy the demo command' });
  await button.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm ci && npm run dev');
  await expect(button).toHaveClass(/\bcopied\b/);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
});

test('step numbers sit above the step title as an eyebrow', async ({ page }) => {
  await page.goto('/');
  const [num, title] = [await page.locator('#get .step-num').first().boundingBox(), await page.locator('#get .step-head h3').first().boundingBox()];
  expect(num!.y + num!.height).toBeLessThanOrEqual(title!.y + 1);
  expect(Math.abs(num!.x - title!.x)).toBeLessThan(2);
});

test('footer: logo, GitHub, legal notice and privacy policy, the Strava note as plain text and the Ko-fi button – no licence link, no Strava badge', async ({ page }) => {
  await page.goto('/');
  const foot = page.locator('footer');
  await expect(foot.locator('.foot-links a')).toHaveText(['GitHub', 'Legal notice', 'Privacy policy']);
  await expect(foot.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', REPO);
  // A plain link, not Ko-fi's widget: that one loads Google Fonts and images from third parties the privacy policy would have to list
  await expect(foot.locator('.foot-end > a.btn')).toHaveAttribute('href', 'https://ko-fi.com/N5K6292XFF');
  await expect(foot.getByRole('link', { name: 'Support me on Ko-fi' })).toBeVisible();
  // The pages themselves come with the deploy (#55)
  await expect(foot.getByRole('link', { name: 'Legal notice' })).toHaveAttribute('href', 'legal-notice.html');
  await expect(foot.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy-policy.html');
  // Strava API Brand Guidelines: "Compatible with Strava" and no impression of being made or endorsed by Strava – text only, no logo or link
  await expect(foot.locator('.foot-note')).toHaveText('Compatible with Strava. Casquette is an independent project, not developed, sponsored or endorsed by Strava.');
  await expect(foot.locator('a[href*="strava"], img, svg[aria-label*="Strava" i]')).toHaveCount(0);
});

test('get started: centred head and chips, the steps stacked full width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const el of ['#get > .eyebrow', '#get-title']) await expect(page.locator(el)).toHaveCSS('text-align', 'center');
  const steps = await page.locator('#get .steps > li').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), y: r.top }; }));
  expect(new Set(steps.map((s) => s.x)).size).toBe(1);
  expect(new Set(steps.map((s) => s.w)).size).toBe(1);
  for (let i = 1; i < steps.length; i++) expect(steps[i].y).toBeGreaterThan(steps[i - 1].y);
  // Icon and text on the left, the commands next to them
  const [head, block] = [await page.locator('#get .steps > li .step-head').first().boundingBox(), await page.locator('#get .steps > li .cmd-block').first().boundingBox()];
  expect(block!.x).toBeGreaterThan(head!.x + head!.width - 1);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`get started stacks cleanly on a phone (390 px, ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const lefts = async (selector: string) => page.locator(selector).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(await lefts('#get .steps > li')).size).toBe(1);
    for (const el of await page.locator('#get .cmd-block, #get .needs li, footer .foot > *').all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    const { violations } = await new AxeBuilder({ page }).include('#privacy').include('#get').include('footer').analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
}

// Refs #47: the hero – word-by-word H1, real UI fragments on the stage, intro once, final at once
// without motion, matching light/dark UI, the training load card under the shot on a phone.

/** `transform` of an element at rest: none, or the identity an ended animation leaves behind. */
const AT_REST = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/;

/** Waits until site.js has put the fragments on the stage and started its part of the intro. */
async function heroLive(page: Page) {
  await expect(page.locator('#hero')).toHaveClass(/\bis-live\b/);
  await expect(page.locator('#hero .ui-fragment')).toHaveCount(3);
}

/** Timing of the hero's CSS animations, keyed by a readable name of the animated element. */
function heroAnimations(page: Page) {
  return page.evaluate(() => {
    const name = (el: Element) => {
      if (el.matches('.w')) return `word ${el.textContent}`;
      if (el.matches('path.recharts-area-curve')) return el.closest('.hero-card--load') ? 'load line' : 'dashboard line';
      if (el.matches('[data-day]')) return 'calendar day';
      return el.className.toString().split(' ').find((c) => c.startsWith('hero-card--')) ?? el.className.toString().split(' ')[0];
    };
    return document.getAnimations()
      .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target?.closest('#hero'))
      .map((a) => {
        const timing = (a.effect as KeyframeEffect).getTiming();
        return { name: name((a.effect as KeyframeEffect).target!), animation: (a as CSSAnimation).animationName, delay: Number(timing.delay), iterations: timing.iterations };
      });
  });
}

test('hero: eyebrow, the H1 word by word, subline, buttons and the real dashboard with two cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measured in its final place
  await page.goto('/');
  const hero = page.locator('#hero');
  await expect(hero.locator('.eyebrow')).toHaveText('ride. sync. read.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Training dashboard for your rides.');
  await expect(hero.locator('h1 .w')).toHaveText(['Training', 'dashboard', 'for', 'your', 'rides.']);
  await expect(hero.locator('.lede')).toHaveText('No feed, no kudos, no leaderboard. Just your training – form, load and every ride in detail, on your own computer.');
  await expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#get');
  await expect(hero.getByRole('link', { name: 'See the demo' })).toHaveAttribute('href', 'demo/'); // the live demo next to the site (#54)
  await heroLive(page);
  // The real UI fragments (website/ui/), decorative: hidden from assistive tech, not focusable
  await expect(hero.locator('.hero-stage')).toHaveAttribute('aria-hidden', 'true');
  for (const [box, name] of [['.hero-shot', 'dashboard'], ['.hero-card--load', 'load'], ['.hero-card--calendar', 'calendar']]) {
    const fragment = hero.locator(`${box} .ui-fragment[data-fragment="${name}"]`);
    await expect(fragment, name).toHaveCount(1);
    await expect(fragment, name).toHaveAttribute('inert', '');
    await expect(hero.locator(box), name).toBeVisible();
  }
  // Scaled as a whole: the dashboard spans the panel (minus its padding), not cut on the right
  const [shot, dashboard] = [await hero.locator('.hero-shot').boundingBox(), await hero.locator('[data-fragment="dashboard"]').boundingBox()];
  expect(dashboard!.x).toBeGreaterThan(shot!.x);
  expect(dashboard!.x + dashboard!.width).toBeLessThan(shot!.x + shot!.width);
  expect(dashboard!.width).toBeGreaterThan(shot!.width * 0.9);
  // Both cards float over the stage, below the buttons
  const buttons = (await hero.locator('.btns').boundingBox())!;
  for (const card of ['.hero-card--load', '.hero-card--calendar']) {
    expect((await hero.locator(card).boundingBox())!.y, card).toBeGreaterThan(buttons.y + buttons.height);
  }
});

/** The order of the stage part of the intro, from the hero's animation timings. */
function expectStageOrder(all: Awaited<ReturnType<typeof heroAnimations>>) {
  const delay = (name: string, animation: string) => {
    const found = all.filter((a) => a.name === name && a.animation === animation);
    expect(found.length, `${name} ${animation}`).toBeGreaterThan(0);
    return Math.min(...found.map((a) => a.delay));
  };
  // The dashboard rises, the cards pop in, the lines draw, the calendar fills up
  expect(delay('hero-panel', 'hero-rise')).toBeLessThan(delay('hero-card--load', 'hero-pop'));
  expect(delay('hero-card--load', 'hero-pop')).toBeLessThan(delay('hero-card--calendar', 'hero-pop'));
  expect(delay('dashboard line', 'hero-draw')).toBeGreaterThan(delay('hero-panel', 'hero-rise'));
  expect(delay('load line', 'hero-draw')).toBeGreaterThan(delay('hero-card--load', 'hero-pop'));
  expect(delay('calendar day', 'hero-cell')).toBeGreaterThan(delay('hero-card--calendar', 'hero-pop'));
  const days = all.filter((a) => a.name === 'calendar day').map((a) => a.delay);
  expect(new Set(days).size, 'calendar days fill in sequence').toBeGreaterThan(10);
}

for (const width of [1024, 1440, 1920]) {
  test(`hero H1 on two lines: "Training dashboard / for your rides." (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const tops = await page.locator('#hero h1 .w').evaluateAll((ws) => ws.map((w) => Math.round(w.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(tops.slice(0, 2).every((t) => t === tops[0])).toBe(true); // Training dashboard
  });
}

test('every eyebrow keeps 16 px or more to its heading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the hero intro moves them
  await page.goto('/');
  const gaps = await page.locator('.eyebrow').evaluateAll((els) => els.map((el) => {
    const next = el.nextElementSibling!;
    return [el.textContent, Math.round(next.getBoundingClientRect().top - el.getBoundingClientRect().bottom)] as const;
  }));
  expect(gaps.length).toBeGreaterThanOrEqual(6);
  for (const [name, gap] of gaps) expect(gap, name!).toBeGreaterThanOrEqual(14); // heading line boxes sit a little above the cap height
});

test('headings are balanced, running text is pretty', async ({ page }) => {
  await page.goto('/');
  const style = (sel: string) => page.locator(sel).evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).textWrapStyle))]);
  // The real UI fragments keep the app's own text layout
  const site = ':not(.ui-fragment *)';
  expect(await style(`h1${site}, h2${site}, h3${site}`)).toEqual(['balance']);
  expect(await style(`main p${site}, main li${site}`)).toEqual(['pretty']);
});

test('hero intro: plays once in order and ends in its final state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await heroLive(page);
  const all = await heroAnimations(page);
  const delay = (name: string, animation?: string) => {
    const found = all.filter((a) => a.name === name && (!animation || a.animation === animation));
    expect(found.length, `${name} ${animation ?? ''}`).toBeGreaterThan(0);
    return Math.min(...found.map((a) => a.delay));
  };
  // Text first: eyebrow, the words one after another, subline, buttons
  const words = ['Training', 'dashboard', 'for', 'your', 'rides.'].map((w) => delay(`word ${w}`));
  expect(delay('eyebrow')).toBeLessThan(words[0]);
  for (let i = 1; i < words.length; i++) expect(words[i]).toBeGreaterThan(words[i - 1]);
  expect(delay('lede')).toBeLessThan(delay('btns'));
  // Then the stage, after the buttons have started
  expect(delay('hero-panel', 'hero-rise')).toBeLessThan(delay('hero-card--load', 'hero-pop'));
  expectStageOrder(all);
  // Once: only the cards' gentle float repeats
  expect(all.filter((a) => a.iterations !== 1).map((a) => a.animation).sort()).toEqual(['hero-bob', 'hero-bob']);

  // The end state, after the intro has played
  await page.waitForFunction(() => document.getAnimations()
    .filter((a) => (a.effect as KeyframeEffect).target?.closest('#hero') && (a.effect as KeyframeEffect).getTiming().iterations === 1)
    .every((a) => a.playState === 'finished'), undefined, { timeout: 10_000 });
  for (const el of await page.locator('#hero .eyebrow, #hero h1 .w, #hero .lede, #hero .btns, #hero .hero-panel').all()) {
    await expect(el).toHaveCSS('opacity', '1');
    await expect(el).toHaveCSS('transform', AT_REST);
  }
  for (const card of ['.hero-card--load', '.hero-card--calendar']) await expect(page.locator(card)).toHaveCSS('opacity', '1');
  for (const path of await page.locator('#hero path.recharts-area-curve').all()) await expect(path).toHaveCSS('stroke-dashoffset', '0px');
  for (const day of await page.locator('#hero .hero-card--calendar [role=gridcell] > [data-day]').all()) await expect(day).toHaveCSS('transform', AT_REST);
});

test('hero intro: slow fragments keep the order of the stage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/ui/*.html', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.goto('/');
  await heroLive(page);
  expectStageOrder(await heroAnimations(page));
  await expect(page.locator('#hero .hero-card--load')).toHaveCSS('opacity', '1', { timeout: 4000 });
});

test('hero with reduced motion: everything in its final state at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await heroLive(page);
  expect(await heroAnimations(page)).toEqual([]);
  for (const el of await page.locator('#hero .eyebrow, #hero h1 .w, #hero .lede, #hero .btns, #hero .hero-panel, #hero .hero-card').all()) {
    await expect(el).toHaveCSS('opacity', '1');
    await expect(el).toHaveCSS('transform', 'none');
  }
  for (const path of await page.locator('#hero path.recharts-area-curve').all()) {
    await expect(path).toHaveCSS('stroke-dasharray', 'none');
    await expect(path).toHaveCSS('stroke-dashoffset', '0px');
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`hero UI follows the theme (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await heroLive(page);
    // The app's panel and card colours (src/styles/app.css) in the shot and in both cards
    const [panel, card] = scheme === 'dark' ? ['rgb(19, 27, 46)', 'rgb(26, 35, 56)'] : ['rgb(247, 248, 249)', 'rgb(236, 238, 241)'];
    await expect(page.locator('#hero .hero-panel')).toHaveCSS('background-color', panel);
    for (const box of ['.hero-shot', '.hero-card--load', '.hero-card--calendar']) {
      await expect(page.locator(`#hero ${box} [data-slot$="-card"]`).first(), box).toHaveCSS('background-color', card);
    }
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`hero on a phone: the training load card under the shot, overlapping only its faded bottom (390 px, ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await heroLive(page);
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const [buttons, shot, card] = [await box('#hero .btns'), await box('#hero .hero-shot'), await box('#hero .hero-card--load')];
    expect(shot.y).toBeGreaterThanOrEqual(buttons.y + buttons.height);
    // Pulled up into the shot, but only into its faded bottom (fade-bottom from 55 %)
    expect(card.y).toBeLessThan(shot.y + shot.height);
    expect(card.y).toBeGreaterThan(shot.y + shot.height * .55);
    for (const b of [shot, card]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    await expect(page.locator('#hero .hero-card--calendar')).toBeHidden();
    // The whole dashboard fits the phone's width
    const dashboard = await box('#hero [data-fragment="dashboard"]');
    expect(dashboard.x + dashboard.width).toBeLessThanOrEqual(shot.x + shot.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    // The panel's corner shrinks with the dashboard: concentric with its scaled cards (8 px + --pad)
    const radius = await page.locator('#hero .hero-shot').evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeLessThanOrEqual(32 * dashboard.width / 1120 + 1);
  });
}

for (const width of [390, 1440]) {
  test(`map crop keeps its aspect ratio (${width} px)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const img = page.locator('#map .map-dark');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    const { width: w, height: h } = (await img.boundingBox())!;
    expect(h / w).toBeCloseTo(820 / 1120, 2);
  });
}
