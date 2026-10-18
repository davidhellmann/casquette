// @ts-nocheck – typed in phase B of docs/adr/0004
/** Existing dashboard guidance, independent of DOM, geometry and display rounding. */
export const ftpRecommendation = (estimated, ftp) => !estimated || !ftp ? 'none'
  : estimated > ftp * 1.03 ? 'test' : estimated < ftp * .9 ? 'under' : 'none';

/** Aerobic decoupling (%) below `stable` = stable, below `moderate` = moderate, otherwise drift. */
export const DECOUPLING_LIMITS = { stable: 5, moderate: 10 };
export const decouplingStatus = (percent) => percent == null ? 'unknown'
  : percent < DECOUPLING_LIMITS.stable ? 'stable' : percent < DECOUPLING_LIMITS.moderate ? 'moderate' : 'drift';

/** Daily needs per kg body weight by training category: carbohydrate (g), protein (g), fat (g), water (l). */
const CARB_FACTORS = { light: [4, 5], moderate: [5, 7], high: [7, 10] };
const BASE_FACTORS = { protein: [1.6, 2], fat: [.8, 1.2], water: [.035, .04] };

/**
 * Daily needs from the average daily training hours: the category (under 0.75 h light, under 1.5 h
 * moderate, else high), the factors per kg used (`perKg`, ranges) and, with a known body weight, the
 * daily `amounts` (ranges in g, water in l; otherwise null).
 */
export function dailyNeeds(dailyHours, weight) {
  const category = dailyHours < .75 ? 'light' : dailyHours < 1.5 ? 'moderate' : 'high';
  const perKg = Object.fromEntries(Object.entries({ carbs: CARB_FACTORS[category], ...BASE_FACTORS }).map(([k, range]) => [k, [...range]]));
  const amounts = weight > 0 ? Object.fromEntries(Object.entries(perKg).map(([k, range]) => [k, range.map(x => x * weight)])) : null;
  return { category, perKg, amounts };
}
