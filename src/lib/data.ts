/**
 * The build's data: the file data source (synced data or the shipped demo data, never mixed – see
 * data-source.ts) and the build dataset of this build, created once at the build clock.
 * Runs at build time or in the dev server. Everything else lives in build-dataset.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { readOptionalPersonalJSON, readPersonalJSON } from './personal-data.ts';
import { selectDataSource } from './data-source.ts';
import { createBuildDataset } from './build-dataset.ts';
import type { AthleteSource, BuildDataset, DataSource, DemoMeta } from './build-dataset.ts';
import type { ChartStreams } from './chart-streams.ts';
import type { AthleteHistoryEntry } from '../training/index.ts';
import type { Goal } from '../scripts/goals.ts';

/** The file source serves Astro's collection entries (renderable on the ride and gear pages). */
export interface FileEntries {
  rides: CollectionEntry<'rides'>;
  gear: CollectionEntry<'gear'>;
}

/** Parsed JSON of a file, `fallback` when it is missing or broken. Parse seam: the caller names the documented shape. */
const readJSON = <T>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

/**
 * Data source adapter on the file system and the content collections (src/content.config.ts reads the
 * same folders): athlete.json, fitness-history.json (else its example), zones.json (optional), goals.json
 * (else its example), the demo's meta.json, ride and gear entries, and chart streams.
 * The JSON files are not validated here (parse seam): they are written by the sync or the demo generator
 * in the documented shapes; the athlete timeline checks the history and the zones file.
 */
export function fileSource(
  { root = process.cwd(), env = process.env }: { root?: string; env?: Record<string, string | undefined> } = {},
): DataSource<FileEntries> {
  const dirs = selectDataSource({ root, env });
  return {
    demo: dirs.demo,
    athlete: () => readJSON<AthleteSource>(path.join(dirs.dataDir, 'athlete.json'), {}),
    history: () => readPersonalJSON('fitness-history', [], { dir: dirs.dataDir }) as AthleteHistoryEntry[],
    zonesFile: () => readOptionalPersonalJSON('zones', { dir: dirs.dataDir }),
    goals: () => readPersonalJSON('goals', [], { dir: dirs.dataDir }) as Goal[],
    meta: () => readJSON<DemoMeta>(path.join(dirs.dataDir, 'meta.json'), {}),
    rides: () => getCollection('rides'),
    gear: async () => { try { return await getCollection('gear'); } catch { return []; } },
    streams: (id) => readJSON<ChartStreams | null>(path.join(dirs.streamsDir, `${id}.json`), null),
    streamIds: () => {
      try { return fs.readdirSync(dirs.streamsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
    },
  };
}

let dataset: Promise<BuildDataset<FileEntries>> | undefined;
/** The build dataset of this build: the file data source at the build clock – the only place that reads the clock. */
export const getDataset = (): Promise<BuildDataset<FileEntries>> => (dataset ??= createBuildDataset(fileSource(), { now: new Date() }));
