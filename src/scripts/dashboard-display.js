import { nf, fmtDur, zr } from './format.js';
import { POWER_ZONE_NAMES, HR_ZONE_NAMES } from '../training/index.js';
import { t } from '../i18n/index.js';

/** Display of the finished classification only, no zone assignment. */
export function classificationText(r, c) {
  switch (c.source) {
    case 'power': return { src: t('classification.power'), val: Math.round(r.w) + ' W' };
    case 'hr': return { src: t('classification.hr'), val: Math.round(r.hr) + ' bpm' };
    case 'effort': return { src: t('classification.effort'), val: '≈ Z' + c.zone };
    default: return { src: '–', val: '–' };
  }
}

/** Explicit sync basis; never lay current/historical ride zones over legacy TIZ. */
export function dashboardTiz(r, basis) {
  const isP = basis === 'power', seconds = isP ? r.tizP : r.tizH;
  const meta = r.tizBasis?.[basis];
  const ftp = meta?.ftp != null ? t('zones.basisSyncFtp', { ftp: meta.ftp }) : t('zones.basisSyncFtpUnknown');
  const label = meta?.label ?? (isP
    ? t(meta?.source === 'legacy' || meta?.source === 'none' ? 'zones.basisLegacy' : 'zones.basisNoBounds', { ftp })
    : t('zones.basisHrUnknown'));
  const names = isP ? POWER_ZONE_NAMES : HR_ZONE_NAMES;
  return { label, rows: (seconds || []).map((sec, i) => ({ z: i + 1, name: names[i],
    range: meta?.zones?.[i] ? zr(meta.zones[i], isP ? 'W' : 'bpm') : t('zones.unknownBoundaries'), sec })) };
}

/** Public display contract of the ride analysis; formats final values only. */
export function rideChips(r) {
  const number = (v, digits = 0) => v == null ? '–' : nf(v, digits);
  const m = (key) => t('metric.' + key);
  return [[m('distance'), nf(r.distance / 1000, 1) + ' km'], [m('movingTime'), fmtDur(r.moving_time)],
    [m('elevation'), nf(r.elev) + ' ' + t('units.elev')], [m(r.indoor ? 'avgSpeedVirtual' : 'avgSpeed'), nf(r.speed * 3.6, 1) + ' km/h'],
    [m('powerNp'), `${number(r.w)} / ${number(r.np)} W`],
    [m('ifTss'), `${number(r.if_, 2)} · ${number(r.tss)}`], [m('metricsFtp'), number(r.ftp) + ' W'],
    ['EF', number(r.ef, 3)], [m('hrAvgMax'), `${number(r.hr)} / ${number(r.hr_max)}`],
    [m('avgCadence'), r.cad != null ? number(r.cad) + ' rpm' : '–'],
    [m('calories'), r.kcal != null ? number(r.kcal) + ' kcal' : '–'], [m('relEffort'), number(r.re)]];
}
