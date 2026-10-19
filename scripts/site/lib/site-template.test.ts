import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addressLines, applyBlock, cabinScript, escapeHtml, fillPlaceholders, findLeftovers, injectCabin,
  placeholderValues, readSiteEnv, renderPage, SiteBuildError,
} from './site-template.ts';
import { buildSite } from './site-build.ts';

// Placeholder values only – never real personal details in tests (#55).
const ENV = {
  SITE_LEGAL_NAME: 'Jane Rider',
  SITE_LEGAL_ADDRESS: 'Example Street 1|1234 Sample Town',
  SITE_LEGAL_COUNTRY: 'Austria',
  SITE_LEGAL_EMAIL: 'jane@example.com',
};
const PAGE = '<!doctype html><html><body><p>{{SITE_LEGAL_NAME}}</p></body></html>';

describe('escapeHtml', () => {
  it('escapes the characters that matter in text and attributes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('Jane Rider')).toBe('Jane Rider');
  });
});

describe('addressLines', () => {
  it('splits on |, new lines and a literal \\n, trimmed, empty lines dropped', () => {
    expect(addressLines('Example Street 1 | 1234 Sample Town')).toEqual(['Example Street 1', '1234 Sample Town']);
    expect(addressLines('Example Street 1\n1234 Sample Town\n')).toEqual(['Example Street 1', '1234 Sample Town']);
    expect(addressLines('Example Street 1\\n1234 Sample Town')).toEqual(['Example Street 1', '1234 Sample Town']);
    expect(addressLines('  |  ')).toEqual([]);
  });
});

describe('readSiteEnv', () => {
  it('reads the legal details; Cabin off without its host', () => {
    expect(readSiteEnv(ENV)).toEqual({
      legal: { name: 'Jane Rider', address: ['Example Street 1', '1234 Sample Town'], country: 'Austria', email: 'jane@example.com' },
      cabinHost: null,
    });
  });

  it('names every missing legal variable at once', () => {
    expect(() => readSiteEnv({})).toThrow(SiteBuildError);
    expect(() => readSiteEnv({ ...ENV, SITE_LEGAL_NAME: ' ', SITE_LEGAL_EMAIL: undefined }))
      .toThrow(/missing: SITE_LEGAL_NAME, SITE_LEGAL_EMAIL/);
  });

  it('refuses an address without lines, an invalid email and a Cabin host with scheme or path', () => {
    expect(() => readSiteEnv({ ...ENV, SITE_LEGAL_ADDRESS: '|' })).toThrow(/SITE_LEGAL_ADDRESS has no address lines/);
    expect(() => readSiteEnv({ ...ENV, SITE_LEGAL_EMAIL: 'jane at example' })).toThrow(/SITE_LEGAL_EMAIL is not an email/);
    expect(() => readSiteEnv({ ...ENV, SITE_LEGAL_EMAIL: 'jane@example.com"><script>' })).toThrow(/SITE_LEGAL_EMAIL/);
    for (const host of ['https://cabin.example.com', 'cabin.example.com/hello.js', 'localhost', 'a b.example.com']) {
      expect(() => readSiteEnv({ ...ENV, SITE_CABIN_HOST: host }), host).toThrow(/SITE_CABIN_HOST must be a bare host name/);
    }
  });

  it('accepts the default Cabin host and a custom subdomain', () => {
    expect(readSiteEnv({ ...ENV, SITE_CABIN_HOST: 'scripts.withcabin.com' }).cabinHost).toBe('scripts.withcabin.com');
    expect(readSiteEnv({ ...ENV, SITE_CABIN_HOST: ' Cabin.Example.com ' }).cabinHost).toBe('cabin.example.com');
  });
});

describe('fillPlaceholders', () => {
  it('fills known keys, escapes values and joins address lines with <br>', () => {
    const values = placeholderValues(readSiteEnv({ ...ENV, SITE_LEGAL_NAME: 'Jane <Rider> & Co' }));
    expect(fillPlaceholders('<p>{{SITE_LEGAL_NAME}}</p><p>{{ SITE_LEGAL_ADDRESS }}</p>', values))
      .toBe('<p>Jane &lt;Rider&gt; &amp; Co</p><p>Example Street 1<br>\n1234 Sample Town</p>');
    expect(fillPlaceholders('<a href="mailto:{{SITE_LEGAL_EMAIL}}">{{SITE_LEGAL_EMAIL}}</a>', values))
      .toBe('<a href="mailto:jane@example.com">jane@example.com</a>');
  });

  it('leaves unknown keys for findLeftovers, and $ in values stays literal', () => {
    expect(fillPlaceholders('{{NOPE}} {{SITE_LEGAL_NAME}}', { SITE_LEGAL_NAME: 'a $& b' })).toBe('{{NOPE}} a $& b');
  });
});

describe('findLeftovers', () => {
  it('finds any {{…}}, also typos and unclosed ones', () => {
    expect(findLeftovers('<p>Jane</p>')).toEqual([]);
    expect(findLeftovers('{{SITE_LEGAL_NAM}} {{ x }} {{SITE_LEGAL_NAM}}')).toEqual(['{{SITE_LEGAL_NAM}}', '{{ x }}']);
    expect(findLeftovers('<p>{{SITE_LEGAL_NAME</p>')).toEqual(['{{']);
  });
});

describe('applyBlock', () => {
  const html = '<ul>\n  <li>GitHub</li>\n  <!-- if:cabin --><li>Cabin {{SITE_CABIN_HOST}}</li><!-- end:cabin -->\n</ul>';
  it('keeps the content without markers when on', () => {
    expect(applyBlock(html, 'cabin', true)).toBe('<ul>\n  <li>GitHub</li>\n<li>Cabin {{SITE_CABIN_HOST}}</li></ul>');
  });
  it('drops the whole block when off', () => {
    expect(applyBlock(html, 'cabin', false)).toBe('<ul>\n  <li>GitHub</li>\n</ul>');
  });
});

describe('injectCabin', () => {
  it('adds the script before </body> when a host is set, once', () => {
    const out = injectCabin(PAGE, 'cabin.example.com');
    expect(out).toContain(`${cabinScript('cabin.example.com')}\n</body>`);
    expect(cabinScript('cabin.example.com')).toBe('<script async defer src="https://cabin.example.com/hello.js"></script>');
    expect(injectCabin(out, 'cabin.example.com')).toBe(out);
  });
  it('skips without a host and on fragments without <body>', () => {
    expect(injectCabin(PAGE, null)).toBe(PAGE);
    expect(injectCabin('<div class="ui-fragment"></div>', 'cabin.example.com')).toBe('<div class="ui-fragment"></div>');
  });
});

describe('renderPage', () => {
  it('fills, keeps the Cabin block and injects with a host', () => {
    const config = readSiteEnv({ ...ENV, SITE_CABIN_HOST: 'cabin.example.com' });
    const out = renderPage('<html><body>{{SITE_LEGAL_NAME}}<!-- if:cabin --> via {{SITE_CABIN_HOST}}<!-- end:cabin --></body></html>', config);
    expect(out).toBe(`<html><body>Jane Rider via cabin.example.com  ${cabinScript('cabin.example.com')}\n</body></html>`);
  });
  it('drops the Cabin block and injects nothing without a host', () => {
    const out = renderPage('<html><body>{{SITE_LEGAL_NAME}}<!-- if:cabin --> via {{SITE_CABIN_HOST}}<!-- end:cabin --></body></html>', readSiteEnv(ENV));
    expect(out).toBe('<html><body>Jane Rider</body></html>');
  });
  it('fails loudly on a leftover placeholder, naming the file', () => {
    expect(() => renderPage('<p>{{SITE_CABIN_HOST}}</p>', readSiteEnv(ENV), 'privacy-policy.html'))
      .toThrow(/privacy-policy\.html still contains \{\{SITE_CABIN_HOST\}\}/);
  });
});

describe('buildSite', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'site-build-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const write = (dir: string, files: Record<string, string>) => { for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); } };

  it('copies the site, fills the pages, skips README.md, injects Cabin into site and demo', () => {
    const src = tmp(), demo = tmp(), out = path.join(tmp(), 'dist-site');
    write(src, { 'index.html': PAGE, 'site.css': 'body{}', 'README.md': 'notes', 'ui/load.html': '<div class="ui-fragment"></div>' });
    write(demo, { 'index.html': '<html><body>demo</body></html>', 'rides/x/index.html': '<html><body>ride</body></html>' });
    const result = buildSite({ src, out, demo, env: { ...ENV, SITE_CABIN_HOST: 'cabin.example.com' } });
    expect(result.pages.sort()).toEqual(['index.html', path.join('ui', 'load.html')]);
    expect(result.demoPages.sort()).toEqual([path.join('demo', 'index.html'), path.join('demo', 'rides', 'x', 'index.html')]);
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toContain('<p>Jane Rider</p>');
    expect(fs.readFileSync(path.join(out, 'site.css'), 'utf8')).toBe('body{}');
    expect(fs.existsSync(path.join(out, 'README.md'))).toBe(false);
    expect(fs.readFileSync(path.join(out, 'ui', 'load.html'), 'utf8')).toBe('<div class="ui-fragment"></div>');
    for (const page of ['index.html', 'demo/index.html', 'demo/rides/x/index.html']) {
      expect(fs.readFileSync(path.join(out, page), 'utf8'), page).toContain(cabinScript('cabin.example.com'));
    }
    // The demo folder itself stays untouched
    expect(fs.readFileSync(path.join(demo, 'index.html'), 'utf8')).toBe('<html><body>demo</body></html>');
  });

  it('without SITE_CABIN_HOST no page gets a script', () => {
    const src = tmp(), demo = tmp(), out = path.join(tmp(), 'out');
    write(src, { 'index.html': PAGE });
    write(demo, { 'index.html': '<html><body>demo</body></html>' });
    buildSite({ src, out, demo, env: ENV });
    for (const page of ['index.html', 'demo/index.html']) expect(fs.readFileSync(path.join(out, page), 'utf8')).not.toContain('<script');
  });

  it('empties the output folder first, and refuses one that overlaps a source', () => {
    const src = tmp(), out = tmp();
    write(src, { 'index.html': PAGE });
    write(out, { 'stale.html': 'old' });
    buildSite({ src, out, env: ENV });
    expect(fs.existsSync(path.join(out, 'stale.html'))).toBe(false);
    expect(() => buildSite({ src, out: src, env: ENV })).toThrow(/must be separate/);
    expect(() => buildSite({ src, out: path.join(src, 'dist'), env: ENV })).toThrow(/must be separate/);
    expect(() => buildSite({ src: path.join(out, 'x'), out, env: ENV })).toThrow(SiteBuildError);
  });

  it('fails before writing anything when a variable is missing', () => {
    const src = tmp(), out = path.join(tmp(), 'out');
    write(src, { 'index.html': PAGE });
    expect(() => buildSite({ src, out, env: { ...ENV, SITE_LEGAL_COUNTRY: '' } })).toThrow(/missing: SITE_LEGAL_COUNTRY/);
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe('the website templates', () => {
  const site = new URL('../../../website/', import.meta.url);
  const read = (f: string) => fs.readFileSync(new URL(f, site), 'utf8');

  it('build cleanly with placeholder values, with and without Cabin', () => {
    const envs: Record<string, string>[] = [ENV, { ...ENV, SITE_CABIN_HOST: 'cabin.example.com' }];
    for (const file of ['index.html', 'legal-notice.html', 'privacy-policy.html']) {
      for (const env of envs) {
        const out = renderPage(read(file), readSiteEnv(env), file);
        expect(findLeftovers(out), file).toEqual([]);
        expect(out.includes('cabin.example.com'), file).toBe(Boolean(env.SITE_CABIN_HOST));
      }
    }
  });

  it('use every legal placeholder, and Cabin only inside its blocks', () => {
    const legal = read('legal-notice.html') + read('privacy-policy.html');
    for (const key of ['SITE_LEGAL_NAME', 'SITE_LEGAL_ADDRESS', 'SITE_LEGAL_COUNTRY', 'SITE_LEGAL_EMAIL']) expect(legal).toContain(`{{${key}}}`);
    // Without Cabin, no visible word about it (comments for maintainers aside)
    expect(applyBlock(legal, 'cabin', false).replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/SITE_CABIN_HOST|cabin/i);
  });

  it('the privacy policy lists exactly the custom events the website sends', () => {
    const sent = [...read('index.html').matchAll(/data-cabin-event="([^"]+)"/g)].map((m) => m[1]);
    const listed = [...read('privacy-policy.html').matchAll(/<li data-event>([^<]+)<\/li>/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(0);
    expect([...new Set(sent)].sort()).toEqual([...listed].sort());
  });
});
