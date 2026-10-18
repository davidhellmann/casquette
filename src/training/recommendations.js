/** Existing dashboard guidance, independent of DOM, geometry and display rounding. */
export const ftpRecommendation = (estimated, ftp) => !estimated || !ftp ? 'none'
  : estimated > ftp * 1.03 ? 'test' : estimated < ftp * .9 ? 'under' : 'none';

/** Aerobic decoupling (%) below `stable` = stable, below `moderate` = moderate, otherwise drift. */
export const DECOUPLING_LIMITS = { stable: 5, moderate: 10 };
export const decouplingStatus = (percent) => percent == null ? 'unknown'
  : percent < DECOUPLING_LIMITS.stable ? 'stable' : percent < DECOUPLING_LIMITS.moderate ? 'moderate' : 'drift';

export function dailyNeeds(weight, carbsPerKg) {
  if (!(weight > 0)) return null;
  const scale = range => range.map(x => x * weight);
  return { carbs: scale(carbsPerKg), protein: scale([1.6, 2]), fat: scale([.8, 1.2]), water: scale([.035, .04]) };
}
