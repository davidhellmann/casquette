import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOptionalPersonalJSON, readPersonalJSON } from './personal-data.ts';
import { athleteTimeline } from '../training/index.ts';

let dir: string;
const put = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-data-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readPersonalJSON – personal file with example fallback', () => {
  it('uses the personal file when it exists', () => {
    put('goals.json', [{ id: 'mine' }]);
    put('goals.example.json', [{ id: 'example' }]);
    expect(readPersonalJSON('goals', [], { dir })).toEqual([{ id: 'mine' }]);
  });

  it('falls back to the example file without a personal file', () => {
    put('goals.example.json', [{ id: 'example' }]);
    expect(readPersonalJSON('goals', [], { dir })).toEqual([{ id: 'example' }]);
  });

  it('returns the default when neither personal nor example file exists', () => {
    expect(readPersonalJSON('goals', [], { dir })).toEqual([]);
  });

  it('falls back to the example file for a broken personal file', () => {
    put('fitness-history.json', '{ broken');
    put('fitness-history.example.json', [{ date: '2024-01-01', ftp: 250 }]);
    expect(readPersonalJSON('fitness-history', [], { dir })).toEqual([{ date: '2024-01-01', ftp: 250 }]);
  });
});

describe('readOptionalPersonalJSON – personal file whose example is documentation only', () => {
  it('uses the personal file when it exists', () => {
    put('zones.json', { heart_rate: [] });
    expect(readOptionalPersonalJSON('zones', { dir })).toEqual({ heart_rate: [] });
  });

  it('ignores the example file: without a personal file there is nothing', () => {
    put('zones.example.json', { heart_rate: [{ bpm: [0, 1, 2, 3, 4] }] });
    expect(readOptionalPersonalJSON('zones', { dir })).toBeNull();
  });

  it('fails loudly for a broken personal file instead of silently ignoring it', () => {
    put('zones.json', '{ broken');
    expect(() => readOptionalPersonalJSON('zones', { dir })).toThrow(/zones\.json/);
  });
});

describe('shipped example files', () => {
  const real = path.join(process.cwd(), 'src/data');
  it.each(['goals', 'fitness-history'])('%s.example.json is a valid, non-empty array', (name) => {
    const data = JSON.parse(fs.readFileSync(path.join(real, `${name}.example.json`), 'utf8'));
    expect(Array.isArray(data) && data.length > 0).toBe(true);
  });

  it('zones.example.json is a valid zones file with dated HR zones and custom power bounds', () => {
    const zonesFile = JSON.parse(fs.readFileSync(path.join(real, 'zones.example.json'), 'utf8'));
    expect(athleteTimeline({ zonesFile }).at('2025-06-01').zones.source).toEqual({ hr: 'file', power: 'file' });
  });
});

