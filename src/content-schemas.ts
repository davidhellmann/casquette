/**
 * Zod schemas of the content collections (see src/content.config.ts).
 * Kept in a plain module so tests and the demo generator can validate frontmatter
 * without the Astro runtime. Only required fields are checked; everything else passes
 * through unchanged (looseObject).
 *
 * Types: a parsed ride entry (`RideEntry`) must satisfy the ride module's input `RideFrontmatter`
 * and a parsed gear entry (`GearEntry`) `GearFrontmatter` – checked at compile time below, so
 * `npm run typecheck` fails when schema and frontmatter type drift apart. Fields the schema lets
 * through unchecked are typed by the frontmatter types only.
 */
import { z } from 'astro/zod';
import { DEFAULT_RIDE_NAME } from './ride/defaults.ts';
import type { RideFrontmatter, RideMetrics } from './ride/index.ts';

const num = z.number().nullable().optional();

/**
 * Parse seam: `metrics` is written by the sync (scripts/shared/metrics.ts) and only checked to be an
 * object here; its fields are typed as the ride module reads them.
 */
const metrics = z.record(z.string(), z.unknown()) as unknown as z.ZodType<RideMetrics>;

export const rideSchema = z.looseObject({
  id: z.coerce.string(),
  name: z.string().default(DEFAULT_RIDE_NAME),
  sport_type: z.string().default('Ride'),
  start_date: z.string().optional(),
  start_date_local: z.string(),
  trainer: z.boolean().default(false),
  distance: num,
  moving_time: num,
  elapsed_time: num,
  total_elevation_gain: num,
  average_watts: num,
  average_heartrate: num,
  metrics: metrics.nullable().optional(),
});

export const gearSchema = z.looseObject({
  id: z.coerce.string(),
  name: z.string().default('Gear'),
  type: z.enum(['bike', 'shoe']).default('bike'),
  distance: z.number().default(0),
  retired: z.boolean().default(false),
  custom: z
    .looseObject({
      purchase_date: z.union([z.string(), z.date()]).nullable().optional(),
      price_eur: z.number().nullable().optional(),
      components: z.array(z.string()).nullable().optional(),
      color: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

/** A ride entry's frontmatter after the content schema. */
export type RideEntry = z.infer<typeof rideSchema>;
/** A gear entry's frontmatter after the content schema. */
export type GearEntry = z.infer<typeof gearSchema>;

/** The `custom:` block of a gear file: the rider's own data, kept across syncs. */
export interface GearCustom {
  /** Purchase day: a written 'YYYY-MM-DD' string or a YAML date. */
  purchase_date?: string | Date | null;
  price_eur?: number | null;
  components?: string[] | null;
  color?: string | null;
  notes?: string | null;
}

/** Gear frontmatter as the build reads it (gear file written by scripts/sync/lib/gear-file.ts). */
export interface GearFrontmatter {
  id: string;
  name: string;
  type: 'bike' | 'shoe';
  /** Strava's distance in metres. */
  distance: number;
  retired: boolean;
  primary?: boolean | null;
  brand?: string | null;
  model?: string | null;
  frame_type?: string | null;
  description?: string | null;
  /** Weight in kg. */
  weight?: number | null;
  custom?: GearCustom | null;
}

// Compile-time checks (erased at runtime): parsed entries are what the build reads.
true satisfies (RideEntry extends RideFrontmatter ? true : false);
true satisfies (GearEntry extends GearFrontmatter ? true : false);
