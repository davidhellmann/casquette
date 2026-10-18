// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Zod schemas of the content collections (see src/content.config.ts).
 * Kept in a plain module so tests and the demo generator can validate frontmatter
 * without the Astro runtime. Only required fields are checked; everything else passes
 * through unchanged (looseObject).
 */
import { z } from 'astro/zod';
import { DEFAULT_RIDE_NAME } from './ride/defaults.ts';

const num = z.number().nullable().optional();

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
  metrics: z.record(z.string(), z.any()).nullable().optional(),
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
