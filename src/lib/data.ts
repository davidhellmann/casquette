// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * The build's data: the file data source (synced data or the shipped demo data, never mixed – see
 * data-source.ts) and the build dataset of this build, created once at the build clock.
 * Runs at build time or in the dev server. Everything else lives in build-dataset.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getCollection } from 'astro:content';
import { readOptionalPersonalJSON, readPersonalJSON } from './personal-data.ts';
import { selectDataSource } from './data-source.ts';
import { createBuildDataset } from './build-dataset.ts';

const readJSON = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

/**
 * Data source adapter on the file system and the content collections (src/content.config.ts reads the
 * same folders): athlete.json, fitness-history.json (else its example), zones.json (optional), goals.json
 * (else its example), the demo's meta.json, ride and gear entries, and chart streams.
 * @returns {import('./build-dataset.ts').DataSource}
 */
export function fileSource({ root = process.cwd(), env = process.env } = {}) {
  const dirs = selectDataSource({ root, env });
  return {
    demo: dirs.demo,
    athlete: () => readJSON(path.join(dirs.dataDir, 'athlete.json'), {}),
    history: () => readPersonalJSON('fitness-history', [], { dir: dirs.dataDir }),
    zonesFile: () => readOptionalPersonalJSON('zones', { dir: dirs.dataDir }),
    goals: () => readPersonalJSON('goals', [], { dir: dirs.dataDir }),
    meta: () => readJSON(path.join(dirs.dataDir, 'meta.json'), {}),
    rides: () => getCollection('rides'),
    gear: async () => { try { return await getCollection('gear'); } catch { return []; } },
    streams: (id) => readJSON(path.join(dirs.streamsDir, `${id}.json`), null),
    streamIds: () => {
      try { return fs.readdirSync(dirs.streamsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
    },
  };
}

let dataset;
/** The build dataset of this build: the file data source at the build clock – the only place that reads the clock. */
export const getDataset = () => (dataset ??= createBuildDataset(fileSource(), { now: new Date() }));
