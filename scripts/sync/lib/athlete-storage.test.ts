import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAthleteStorage, GEAR_TTL_MS } from './athlete-storage.ts';
import type { CachedGear } from './athlete-storage.ts';
import type { HistoryEntry } from '../../shared/athlete-file.ts';
import type { Clock } from '../../shared/env.ts';

let root: string, now: number;
const clock: Clock = { now: () => now, sleep: async () => {} };
const open = () => createAthleteStorage({ root, clock });
const put = (name: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), JSON.stringify(value));
};
const json = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const history = () => json('src/data/fitness-history.json') as HistoryEntry[];
const gearCache = () => json('.strava-cache/gear.json') as Record<string, CachedGear>;
const epoch = (iso: string) => Date.parse(iso) / 1000;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'athlete-')); now = Date.parse('2024-05-01T12:00:00Z'); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('athlete history', () => {
  const tz = process.env.TZ;
  // Noon of 1 May on the local clock: the same calendar day in every time zone.
  beforeEach(() => { now = new Date(2024, 4, 1, 12).getTime(); });
  afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });

  it('appends FTP and weight only when they change', () => {
    expect(open().recordFitness({ ftp: 250, weight: 75 })).toEqual({ id: '2024-05-01', date: '2024-05-01', ftp: 250, weight: 75, source: 'strava', note: 'Initial value from Strava' });
    now += 86400e3;
    expect(open().recordFitness({ ftp: 250, weight: 75 })).toBeNull();
    put('src/data/fitness-history.json', [...history(), { id: 'test', date: '2024-05-01', ftp: 260, weight: 75, source: 'manual' }]);
    expect(open().recordFitness({ ftp: 260, weight: 75 })).toBeNull(); // compared with the latest entry by date
    expect(open().recordFitness({ ftp: 260, weight: 74 })).toMatchObject({ date: '2024-05-02', note: 'Change detected in Strava' });
    expect(history().map((h) => h.id)).toEqual(['2024-05-01', 'test', '2024-05-02']);
  });

  it('dates the entry with the local calendar day, not the UTC day', () => {
    process.env.TZ = 'Pacific/Auckland';
    now = Date.parse('2024-05-01T20:00:00Z'); // 2 May, 08:00 in Auckland
    expect(open().recordFitness({ ftp: 250, weight: 75 })?.date).toBe('2024-05-02');
    process.env.TZ = 'America/Los_Angeles';
    now = Date.parse('2024-05-03T03:00:00Z'); // 2 May, 20:00 in Los Angeles
    expect(open().recordFitness({ ftp: 251, weight: 75 })).toMatchObject({ id: '2024-05-02', date: '2024-05-02' });
    // Same local day: the entry of that day is replaced.
    expect(history().map((h) => [h.date, h.ftp])).toEqual([['2024-05-02', 251]]);
  });

  it('refuses to date an entry with an invalid clock time instead of writing a null day', () => {
    now = NaN;
    expect(() => open().recordFitness({ ftp: 250, weight: 75 })).toThrow('Invalid clock time');
    expect(fs.existsSync(path.join(root, 'src/data/fitness-history.json'))).toBe(false);
  });
});

describe('gear', () => {
  it('merges athlete file gear and gear cache (cache wins) and requires the athlete file unless allowed', () => {
    expect(() => open().gear()).toThrow('src/data/athlete.json');
    expect(open().gear({ requireAthlete: false }).byId).toEqual({});
    put('src/data/athlete.json', { gear: [{ id: 'b1', name: 'Old name' }, { id: 'b2', name: 'Athlete only' }] });
    put('.strava-cache/gear.json', { b1: { id: 'b1', name: 'Cache name', _at: now } });
    const gear = open().gear();
    expect(Object.values(gear.byId).map((g) => g.name)).toEqual(['Cache name', 'Athlete only']);
    gear.add({ id: 'b1', name: 'Ignored', type: 'bike' });
    gear.add({ id: 'b3', name: 'Listed', type: 'bike' });
    expect(gear.byId.b1.name).toBe('Cache name');
    expect(gear.byId.b3.name).toBe('Listed');
  });

  it('refetches details after the 7-day TTL and saves the cache with fetch times, the list without', () => {
    put('src/data/athlete.json', { gear: [{ id: 'b2', name: 'Never fetched' }] });
    const gear = open().gear();
    gear.refresh({ id: 'b1', name: 'Bike', type: 'bike' });
    expect(gear.isFresh('b1')).toBe(true);
    expect(gear.isFresh('b2')).toBe(false);
    expect(gear.isFresh('b9')).toBe(false);
    now += GEAR_TTL_MS - 1;
    expect(gear.isFresh('b1')).toBe(true);
    now += 1;
    expect(gear.isFresh('b1')).toBe(false);
    expect(gear.save()).toEqual([{ id: 'b2', name: 'Never fetched' }, { id: 'b1', name: 'Bike', type: 'bike' }]);
    expect(gearCache().b1._at).toBe(Date.parse('2024-05-01T12:00:00Z'));
  });
});

describe('activity list cursor', () => {
  it('starts with the whole history before tomorrow and no new-activity window', () => {
    const cursor = open().listCursor();
    expect(cursor.complete).toBe(false);
    expect(cursor.newSince()).toBeNull();
    expect(cursor.historyBefore()).toBe(epoch('2024-05-02T12:00:00Z'));
  });

  it('pages back through the history, resumes after a save and ends on a short page', () => {
    let cursor = open().listCursor();
    const page = [{ start_date: '2024-04-20T08:00:00Z' }, { start_date: '2024-03-01T08:00:00Z' }];
    expect(cursor.historyPage(page, 2)).toBe(epoch('2024-03-01T08:00:00Z'));
    expect(cursor.complete).toBe(false);
    cursor.save();
    cursor = open().listCursor();
    expect(cursor.historyBefore()).toBe(epoch('2024-03-01T08:00:00Z'));
    expect(cursor.historyPage([{ start_date: '2024-01-01T08:00:00Z' }], 2)).toBe(epoch('2024-01-01T08:00:00Z'));
    expect(cursor.complete).toBe(true);
  });

  it('ends the history on an empty page', () => {
    const cursor = open().listCursor();
    expect(cursor.historyPage([], 200)).toBeNull();
    expect(cursor.complete).toBe(true);
  });

  it('tracks newest and oldest listed activity; new activities are looked for from three days before the newest', () => {
    const cursor = open().listCursor();
    for (const start_date of ['2024-04-10T08:00:00Z', '2024-04-30T08:00:00Z', 'not a date', '2023-01-01T08:00:00Z']) cursor.seen({ start_date });
    expect(cursor.newSince()).toBe(epoch('2024-04-27T08:00:00Z'));
    expect(cursor.oldest()).toBe('2023-01-01T08:00:00.000Z');
    expect(open().listCursor().newSince()).toBeNull(); // not saved yet
    cursor.save();
    expect(open().listCursor().newSince()).toBe(epoch('2024-04-27T08:00:00Z'));
  });
});
