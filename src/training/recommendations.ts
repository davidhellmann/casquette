/** Existing dashboard guidance, independent of DOM, geometry and display rounding. */

/** FTP recommendation: `test` = estimated FTP clearly above the FTP (time for a test), `under` = clearly below. */
export type FtpRecommendation = 'none' | 'test' | 'under';

export const ftpRecommendation = (estimated: number | null | undefined, ftp: number | null | undefined): FtpRecommendation => !estimated || !ftp ? 'none'
  : estimated > ftp * 1.03 ? 'test' : estimated < ftp * .9 ? 'under' : 'none';

/** Decoupling status of a ride; `unknown` without a decoupling value. */
export type DecouplingStatus = 'unknown' | 'stable' | 'moderate' | 'drift';

/** Aerobic decoupling (%) below `stable` = stable, below `moderate` = moderate, otherwise drift. */
export const DECOUPLING_LIMITS = { stable: 5, moderate: 10 };
export const decouplingStatus = (percent: number | null | undefined): DecouplingStatus => percent == null ? 'unknown'
  : percent < DECOUPLING_LIMITS.stable ? 'stable' : percent < DECOUPLING_LIMITS.moderate ? 'moderate' : 'drift';

/** A range [low, high]. */
export type Range = [number, number];

/** Training category by average daily training hours. */
export type NeedsCategory = 'light' | 'moderate' | 'high';

/** Ranges per nutrient: carbohydrate, protein and fat in g, water in l. */
export interface Nutrients {
  carbs: Range;
  protein: Range;
  fat: Range;
  water: Range;
}

/** Daily needs (GLOSSARY "Daily needs"). */
export interface DailyNeeds {
  category: NeedsCategory;
  /** Factors per kg body weight. */
  perKg: Nutrients;
  /** Daily amounts for the body weight; null without a known (positive) weight. */
  amounts: Nutrients | null;
}

/** Daily needs per kg body weight by training category: carbohydrate (g), protein (g), fat (g), water (l). */
const CARB_FACTORS: Record<NeedsCategory, Range> = { light: [4, 5], moderate: [5, 7], high: [7, 10] };
const BASE_FACTORS: Omit<Nutrients, 'carbs'> = { protein: [1.6, 2], fat: [.8, 1.2], water: [.035, .04] };

/**
 * Daily needs from the average daily training hours: the category (under 0.75 h light, under 1.5 h
 * moderate, else high), the factors per kg used (`perKg`, ranges) and, with a known body weight, the
 * daily `amounts` (ranges in g, water in l; otherwise null).
 */
export function dailyNeeds(dailyHours: number, weight: number | null | undefined): DailyNeeds {
  const category = dailyHours < .75 ? 'light' : dailyHours < 1.5 ? 'moderate' : 'high';
  const each = (n: Nutrients, f: (x: number) => number): Nutrients =>
    ({ carbs: [f(n.carbs[0]), f(n.carbs[1])], protein: [f(n.protein[0]), f(n.protein[1])], fat: [f(n.fat[0]), f(n.fat[1])], water: [f(n.water[0]), f(n.water[1])] });
  const perKg = each({ carbs: CARB_FACTORS[category], ...BASE_FACTORS }, (x) => x);
  const amounts = weight != null && weight > 0 ? each(perKg, (x) => x * weight) : null;
  return { category, perKg, amounts };
}
