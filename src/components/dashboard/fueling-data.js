/**
 * Fueling (GLOSSARY) on the dashboard: carbs per hour on the bike by ride length and intensity.
 * Pure. Daily needs ("nutrition") live in nutrition-data.js.
 */
import { nf } from '../../scripts/format.js';
import { t } from '../../i18n/index.js';

const f = (key, x) => t('dash.fueling.' + key, x);

/** Carbs per hour by ride length (rows) and intensity (columns); `cell` = the selected ride's. */
export function fuelMatrix() {
  const cell = (key, zone, grams, text) => ({ key, zone, grams, text });
  return {
    columns: [f('easy'), f('hard')],
    rows: [
      { label: '< 1 h', cells: [cell('s-l', 1, '0 g/h', f('waterOk')), cell('s-h', 3, '≤ 30 g/h', f('gelOpt'))] },
      { label: `1–${nf(2.5, 1)} h`, cells: [cell('m-l', 2, '30–45 g/h', f('bananaBar')), cell('m-h', 4, '60 g/h', f('gelBarIso'))] },
      { label: `> ${nf(2.5, 1)} h`, cells: [cell('l-l', 2, '60–70 g/h', f('every20')), cell('l-h', 5, '80–90 g/h', f('glucoseFructose'))] },
    ],
    tips: f('tips'),
  };
}
