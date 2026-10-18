// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDemoBuild, normaliseBase, rootRelativeUrls } from './demo-build-check.ts';

// Refs #54: the deploy publishes the demo build only when it contains nothing but the demo dataset.
let tmp;
let demo;
let build;
const put = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), typeof text === 'string' ? text : JSON.stringify(text));
};
const STREAM = { time: [0, 1], latlng: [[48.1, 11.5], [48.2, 11.6]] };
const PAGE = (body = '') => `<!doctype html><html><head><link rel="icon" href="/demo/favicon.svg"></head><body data-demo-note="true">${body}</body></html>`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-check-'));
  demo = path.join(tmp, 'demo');
  build = path.join(tmp, 'dist');
  put(demo, 'rides/2024/2024-06-22_demo-0001.md', '---\nid: "demo-0001"\nsegment_efforts:\n  - name: "Box Hill"\n    segment_id: "demo-seg-box-hill"\n---\n');
  put(demo, 'gear/bdemo1.md', '---\nid: "bdemo1"\n---\n');
  put(demo, 'streams/demo-0001.json', STREAM);
  put(build, 'index.html', PAGE('<a href="/demo/rides/demo-0001">Ride</a><astro-island component-url="/demo/_astro/Map.js"></astro-island>'));
  put(build, 'favicon.svg', '<svg/>');
  put(build, '_astro/Map.js', '');
  put(build, 'rides/demo-0001/index.html', PAGE('<a href="/demo/segments/demo-seg-box-hill/">Box Hill</a>'));
  put(build, 'segments/demo-seg-box-hill/index.html', PAGE());
  put(build, 'gear/bdemo1/index.html', PAGE('<a href="/demo">Home</a>'));
  put(build, 'streams/demo-0001.json', JSON.stringify(STREAM, null, 2));
  put(build, 'streams/.gitkeep', '');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const check = () => checkDemoBuild({ build, root: tmp, base: '/demo/' });

describe('checkDemoBuild', () => {
  it('passes a build of the demo dataset under its base path', () => {
    expect(check()).toEqual([]);
  });

  it('fails a build without the demo marker (real data)', () => {
    put(build, 'index.html', '<!doctype html><html><body></body></html>');
    expect(check()).toEqual([expect.stringMatching(/no demo marker/)]);
  });

  it('fails on ride, bike and segment pages that are not in the demo dataset', () => {
    put(build, 'rides/12345678901/index.html', PAGE());
    put(build, 'gear/b1234567/index.html', PAGE());
    put(build, 'segments/987654/index.html', PAGE());
    expect(check()).toEqual([
      expect.stringMatching(/^rides\/12345678901: ride page/),
      expect.stringMatching(/^gear\/b1234567: bike page/),
      expect.stringMatching(/^segments\/987654: segment page/),
    ]);
  });

  it('fails on a stream that is not in the demo dataset or differs from it', () => {
    put(build, 'streams/12345678901.json', STREAM);
    expect(check()).toEqual([expect.stringMatching(/^streams\/12345678901\.json: stream that is not in the demo dataset/)]);
    fs.rmSync(path.join(build, 'streams/12345678901.json'));
    put(build, 'streams/demo-0001.json', { ...STREAM, latlng: [[47.0, 15.4]] });
    expect(check()).toEqual([expect.stringMatching(/^streams\/demo-0001\.json: differs/)]);
  });

  it('fails on root-relative URLs outside the base path or without a file', () => {
    put(build, 'map/index.html', PAGE('<a href="/rides/demo-0001">Ride</a><img src="/demo/missing.png" srcset="/demo/favicon.svg 1x, /og.png 2x">'));
    put(build, '_astro/app.css', 'a { background: url(/demo/favicon.svg); } b { background: url("/fonts/x.woff2"); }');
    expect(check().sort()).toEqual([
      '_astro/app.css: /fonts/x.woff2 – outside the base path /demo/',
      'map/index.html: /rides/demo-0001 – outside the base path /demo/',
      'map/index.html: /demo/missing.png – no file in the build',
      'map/index.html: /og.png – outside the base path /demo/',
    ].sort());
  });

  it('fails without a build', () => {
    expect(checkDemoBuild({ build: path.join(tmp, 'nothing'), root: tmp, base: '/demo/' })).toEqual([expect.stringMatching(/no index\.html/)]);
  });
});

describe('normaliseBase', () => {
  it.each([['/', '/'], ['', '/'], ['/demo/', '/demo/'], ['demo', '/demo/'], ['/casquette/demo', '/casquette/demo/']])('%j → %j', (input, out) => {
    expect(normaliseBase(input)).toBe(out);
  });
});

describe('rootRelativeUrls', () => {
  it('finds root-relative links, assets and island scripts, not absolute or protocol-relative ones', () => {
    const html = '<a href="/demo/a">a</a><a href="https://x.org/">x</a><script src="//cdn.x/y.js"></script><link href="rel.css">'
      + '<astro-island component-url="/demo/_astro/I.js" renderer-url="/demo/_astro/r.js"></astro-island><img srcset="/demo/s.png 2x">';
    expect(rootRelativeUrls(html)).toEqual(['/demo/a', '/demo/_astro/I.js', '/demo/_astro/r.js', '/demo/s.png']);
  });
});
