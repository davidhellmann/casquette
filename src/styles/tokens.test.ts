// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// The new UI's tokens (app.css): every colour has a light and a dark value, and every
// Tailwind colour utility resolves to a defined token – so no component needs a hex value.
const css = fs.readFileSync(path.resolve(import.meta.dirname, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (selector) => css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
const names = (body) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
/** Tokens whose light value is another token (`--category-1: var(--brand)`) follow that token's theme. */
const aliases = (body) => [...body.matchAll(/(--[\w-]+)\s*:\s*var\(--[\w-]+\)\s*;/g)].map((m) => m[1]);

const light = names(block(':root'));
const dark = names(block('\\.dark'));
const theme = block('@theme inline');

it('gives every light colour token a dark counterpart', () => {
  const themeIndependent = ['--radius', ...aliases(block(':root'))];
  expect(light.length).toBeGreaterThan(40);
  expect(light.filter((n) => !themeIndependent.includes(n) && !dark.includes(n))).toEqual([]);
  expect(dark.filter((n) => !light.includes(n))).toEqual([]);
});

it('maps every Tailwind colour onto a defined token', () => {
  const refs = [...theme.matchAll(/--color-[\w-]+:\s*var\((--[\w-]+)\)/g)].map((m) => m[1]);
  expect(refs.length).toBeGreaterThan(40);
  expect(refs.filter((r) => !light.includes(r))).toEqual([]);
});

it('exposes the data colours and the five-step training-calendar scale', () => {
  for (const t of ['--brand', '--power', '--heart-rate', '--positive', '--warning', '--negative'])
    expect(light).toContain(t);
  for (let i = 0; i <= 4; i++) expect(light).toContain(`--load-${i}`);
  for (let i = 1; i <= 7; i++) expect(light).toContain(`--zone-${i}`);
  for (let i = 1; i <= 6; i++) expect(light).toContain(`--category-${i}`);
});

it('starts the category palette with the pink', () => {
  expect(block(':root')).toMatch(/--category-1:\s*var\(--brand\)/);
});
