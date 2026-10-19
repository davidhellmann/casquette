import { expect, it } from 'vitest';
import { rideSchema } from './content-schemas.ts';
import { rideFrontmatter } from '../scripts/shared/ride-file.ts';

// Refs #20: an unnamed ride gets the same English fallback name in the sync and in the schema.
it('names an unnamed ride "Ride" in the content schema and in the sync', () => {
  expect(rideSchema.parse({ id: 1, start_date_local: '2024-05-01T08:00:00' }).name).toBe('Ride');
  expect(rideFrontmatter({ id: '1', summary: { start_date_local: '2024-05-01T08:00:00' } }).name).toBe('Ride');
});
