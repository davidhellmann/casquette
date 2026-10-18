/**
 * Colours for categories without a data meaning of their own – bikes, terrains. One palette
 * (`--category-1…6`), apart from the brand pink and the zone colours. Used by the route map and
 * the gear charts, so a bike has the same colour on every page.
 */
export const CATEGORY_COLORS = [1, 2, 3, 4, 5, 6].map((n) => `var(--category-${n})`);

/** Colour of the n-th category (wraps around after six). */
export const categoryColor = (n: number) => CATEGORY_COLORS[((n % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length];

/** Colour of a bike without a place in the palette (e.g. a ride without gear). */
export const NO_BIKE_COLOR = 'var(--muted-foreground)';

/**
 * Bike id → colour, by the bike's position in the full bike list (the build dataset's gear order: active bikes
 * first, then by kilometres). Pages build it from all bikes and pass the colours along, so a filtered
 * subset (bikes with routes, bikes with rides) never shifts a bike to another colour.
 */
export function bikeColors(bikeIds: string[]): Record<string, string> {
  return Object.fromEntries(bikeIds.map((id, i) => [id, categoryColor(i)]));
}

/** Terrains (`terrain()` in gear-data.js) in palette order. */
const TERRAINS = ['road', 'gravel', 'mtb', 'indoor'];
export const terrainColor = (terrain: string) => {
  const i = TERRAINS.indexOf(terrain);
  return i < 0 ? NO_BIKE_COLOR : categoryColor(i);
};
