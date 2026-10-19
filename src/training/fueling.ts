/** Fueling: recommendation by duration & intensity (zone). Pure, no I/O. */
import { t } from '../i18n/index.ts';

/** Fueling recommendation for a ride (GLOSSARY "Fueling"). */
export interface Fueling {
  /** Carbohydrate during the ride, g per hour. */
  gph: number;
  /** What to eat during the ride (text). */
  during: string;
  /** What to eat after the ride (text). */
  after: string;
  /** Fluid per hour (text). */
  ml: string;
  /** Carbohydrate for the whole ride, g. */
  total: number;
}

/** Cell of the fueling matrix: duration (short < 1 h, mid < 2.5 h, long) – intensity (high from Z3, low). */
export type FuelCell = `${'s' | 'm' | 'l'}-${'h' | 'l'}`;

/** Fueling recommendation by duration (s) & intensity (ride classification zone; Z3 and above = intense). */
export function fuel(sec: number | null | undefined, zone: number | null | undefined): Fueling {
  const h = (sec || 0) / 3600, hi = zone != null && zone >= 3;
  let gph, during, ml;
  if (h < 1) { gph = hi ? 25 : 0; during = t(hi ? 'fuel.shortHard' : 'fuel.waterOnly'); ml = t('fuel.mlShort'); }
  else if (h < 2.5) { gph = hi ? 60 : 40; during = t(hi ? 'fuel.midHard' : 'fuel.midEasy'); ml = t('fuel.mlMid'); }
  else { gph = hi ? 90 : 70; during = t(hi ? 'fuel.longHard' : 'fuel.longEasy'); ml = t('fuel.mlLong'); }
  const after = h >= 2.5 || (hi && h >= 1) ? t('fuel.afterRecovery', { carbs: h >= 2.5 ? '90–110' : '70–90' }) : t('fuel.afterNormal');
  return { gph, during, after, ml, total: Math.round(gph * h) };
}
export const fuelCell = (sec: number, zone: number | null | undefined): FuelCell =>
  `${(sec / 3600) < 1 ? 's' : (sec / 3600) < 2.5 ? 'm' : 'l'}-${zone != null && zone >= 3 ? 'h' : 'l'}`;
