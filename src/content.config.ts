import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { rideSchema, gearSchema } from './content-schemas.js';
import { selectDataSource } from './lib/data-source.js';

/**
 * rides: one Markdown file per ride – src/content/rides/<year>/<date>_<id>.md
 *        All Strava fields in the frontmatter (written by `npm run sync`), body = description.
 * gear:  one file per bike/shoe – src/content/gear/<id>.md
 *        Strava fields + your own `custom:` block and body (kept across syncs, local only).
 * Both folders are gitignored (only .gitkeep is tracked) – the sync fills them locally.
 *
 * Without any synced ride, both collections read the shipped demo dataset from demo/
 * instead (see src/lib/data-source.js). Real and demo data are never mixed.
 * Schemas: src/content-schemas.js.
 */
const source = selectDataSource();

const rides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: source.ridesDir }),
  schema: rideSchema,
});

const gear = defineCollection({
  loader: glob({ pattern: '*.md', base: source.gearDir }),
  schema: gearSchema,
});

export const collections = { rides, gear };
