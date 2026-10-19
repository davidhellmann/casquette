/**
 * Athlete storage: the athlete-side files the sync keeps next to ride storage – the athlete file,
 * the athlete history, the gear cache and the sync state (activity list cursor). It owns their
 * paths; root and clock are injected. The shapes live in scripts/shared/athlete-file.ts.
 */
import path from 'node:path';
import { ROOT, readJSON, systemClock, writeJSON } from '../../shared/env.ts';
import type { Clock } from '../../shared/env.ts';
import { calendarDay } from '../../../src/training/index.ts';
import { athleteFile, historyEntry } from '../../shared/athlete-file.ts';
import type { AthleteFile, AthleteFileInput, Gear, HistoryEntry } from '../../shared/athlete-file.ts';

/** Gear details are fetched again after a week. */
export const GEAR_TTL_MS = 7 * 86400e3;
/** New activities are looked for from three days before the newest one (late uploads, edits). */
const OVERLAP_S = 3 * 86400;

const FILES = {
  athlete: 'src/data/athlete.json',
  history: 'src/data/fitness-history.json',
  gear: '.strava-cache/gear.json',
  state: '.strava-cache/state.json',
};

/** Gear in the gear cache, stamped with the time its details were fetched (epoch ms). */
export type CachedGear = Gear & { _at?: number };

/** Known gear by id (athlete storage `gear()`): a live map plus how to extend, refresh and save it. */
export type KnownGear = {
  byId: Record<string, CachedGear>;
  add(g: Gear): void;
  isFresh(id: string): boolean;
  refresh(g: Gear): void;
  save(): Gear[];
};

/** An activity as the list cursor sees it (rides or not). */
export type ListedActivity = { start_date: string };

/** The activity list cursor (athlete storage `listCursor()`). */
export type ListCursor = {
  seen(activity: ListedActivity): void;
  newSince(): number | null;
  readonly complete: boolean;
  historyBefore(): number;
  historyPage(list: readonly ListedActivity[] | null | undefined, pageSize: number): number | null;
  oldest(): string | null;
  save(): void;
};

/** Sync state (`.strava-cache/state.json`); times in epoch seconds. */
type ListState = { listComplete: boolean; oldest: number | null; newest: number | null; listCursor?: number };

/** The single place where the sync reads and writes the athlete side. */
export type AthleteStorage = {
  gear(options?: { requireAthlete?: boolean }): KnownGear;
  listCursor(): ListCursor;
  recordFitness(values: { ftp: number | null; weight: number | null }): HistoryEntry | null;
  writeAthlete(data: AthleteFileInput): void;
};

export function createAthleteStorage({ root = ROOT, clock = systemClock }: { root?: string; clock?: Clock } = {}): AthleteStorage {
  const file = (name: keyof typeof FILES) => path.join(root, FILES[name]);

  /**
   * Known gear by id for gear names: athlete file gear plus gear cache (cache wins). A live map:
   * entries added or refreshed here are what ride storage sees. Without the athlete file only a
   * first sync may continue (`requireAthlete: false`).
   */
  function gear({ requireAthlete = true } = {}): KnownGear {
    // The athlete file, gear cache, sync state and history are written here (the history also by hand).
    const athlete = readJSON(file('athlete'), null) as Partial<AthleteFile> | null;
    if (!athlete && requireAthlete) throw new Error('Ride storage needs src/data/athlete.json.');
    const byId: Record<string, CachedGear> = Object.fromEntries((athlete?.gear || []).map((g) => [g.id, g]));
    Object.assign(byId, readJSON(file('gear'), {}) as Record<string, CachedGear>);
    return {
      byId,
      /** Adds gear that is not known yet (e.g. from the athlete's bike list). */
      add(g) { byId[g.id] ||= g; },
      /** Whether the cached details are younger than the TTL. */
      isFresh(id) { const at = byId[id]?._at; return typeof at === 'number' && clock.now() - at < GEAR_TTL_MS; },
      /** Stores freshly fetched details, stamped with the fetch time. */
      refresh(g) { byId[g.id] = { ...g, _at: clock.now() }; },
      /** Writes the gear cache; returns the gear list for the athlete file and gear files. */
      save() {
        writeJSON(file('gear'), byId);
        return Object.values(byId).map(({ _at, ...g }) => g);
      },
    };
  }

  /**
   * Cursor of the activity list: newest/oldest activity seen and how far back the history is
   * loaded. Persisted only on `save()`, i.e. after the rides of the list are stored.
   */
  function listCursor(): ListCursor {
    const state = readJSON(file('state'), { listComplete: false, oldest: null, newest: null }) as ListState;
    return {
      /** Records the start of every listed activity (rides or not). */
      seen(activity) {
        const e = Math.floor(Date.parse(activity.start_date) / 1000);
        if (!Number.isFinite(e)) return;
        state.newest = Math.max(state.newest || 0, e);
        state.oldest = state.oldest ? Math.min(state.oldest, e) : e;
      },
      /** `after` (epoch s) for new activities, or null before the first list. */
      newSince: () => (state.newest ? state.newest - OVERLAP_S : null),
      get complete() { return !!state.listComplete; },
      /** `before` (epoch s) for the next page of the history. */
      historyBefore: () => state.listCursor || Math.floor(clock.now() / 1000) + 86400,
      /** A loaded history page; an empty or short page ends the history. Returns the next `before`. */
      historyPage(list, pageSize) {
        if (!list?.length) { state.listComplete = true; return null; }
        state.listCursor = Math.min(...list.map((a) => Math.floor(Date.parse(a.start_date) / 1000)));
        if (list.length < pageSize) state.listComplete = true;
        return state.listCursor;
      },
      /** Oldest activity seen, as ISO instant. */
      oldest: () => (state.oldest ? new Date(state.oldest * 1000).toISOString() : null),
      save: () => writeJSON(file('state'), state),
    };
  }

  /**
   * Appends FTP and weight to the athlete history when they differ from its latest entry,
   * dated with today's local calendar day. Returns the new entry or null.
   */
  function recordFitness({ ftp, weight }: { ftp: number | null; weight: number | null }) {
    const hist = readJSON(file('history'), []) as HistoryEntry[];
    const last = hist.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
    if (last && last.ftp === ftp && last.weight === weight) return null;
    const day = calendarDay(new Date(clock.now()));
    if (!day) throw new Error(`Invalid clock time: ${clock.now()}`);
    const entry = historyEntry({ day, ftp, weight, source: 'strava', note: last ? 'Change detected in Strava' : 'Initial value from Strava' });
    writeJSON(file('history'), [...hist.filter((h) => h.id !== day), entry]);
    return entry;
  }

  return {
    gear,
    listCursor,
    recordFitness,
    writeAthlete: (data) => writeJSON(file('athlete'), athleteFile(data)),
  };
}
