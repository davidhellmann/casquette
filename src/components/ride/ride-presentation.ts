/**
 * Ride presentation: turns the codes of a final ride (ride classification source, TIZ basis,
 * decoupling) into display text, tones and zone classes – one place for the ride page, the dashboard
 * ride analysis and the ride lists. The ride module (src/ride) itself carries no localised text.
 * Pure, no DOM; unit-tested in ride-presentation.test.js.
 */
import { fmtDur, nf, zr } from '../../scripts/format.ts';
import { DECOUPLING_LIMITS, HR_ZONE_NAMES, POWER_ZONE_NAMES, decouplingStatus } from '../../training/index.ts';
import { t } from '../../i18n/index.ts';

/**
 * The ride classification of `r` for a basis as text: `src` (what decided it), `val` (the measured
 * value or "≈ Z3" for an effort estimate) and `title` ("Avg power: 212 W"). Formats only, no zone
 * assignment.
 */
export function rideClassification(r, basis = 'power') {
  const c = (basis === 'hr' ? r.clsH : r.clsP) ?? { zone: null, source: 'none' };
  const [src, val] =
    c.source === 'power' ? [t('classification.power'), `${Math.round(r.w)} W`]
    : c.source === 'hr' ? [t('classification.hr'), `${Math.round(r.hr)} bpm`]
    : c.source === 'effort' ? [t('classification.effort'), `≈ Z${c.zone}`]
    : ['–', '–'];
  return { zone: c.zone ?? null, source: c.source, estimated: c.source === 'effort', src, val, title: `${src}: ${val}` };
}

/**
 * Label of a ride's TIZ basis (`r.tizBasis.power` / `.hr`) from its source code: historically computed
 * from the distribution, stored at sync (with or without the sync-day boundaries) or legacy.
 */
export function tizBasisLabel(kind, meta) {
  if (kind === 'hr') {
    return t(meta?.source === 'distribution' ? 'zones.basisHrAtDate' : meta?.source === 'sync' ? 'zones.basisHrStored' : 'zones.basisHrUnknown');
  }
  if (meta?.source === 'distribution') return t('zones.basisFtpAtDate', { ftp: meta.ftp });
  const ftp = meta?.ftp != null ? t('zones.basisSyncFtp', { ftp: meta.ftp }) : t('zones.basisSyncFtpUnknown');
  return t(meta?.source === 'legacy' || meta?.source === 'none' ? 'zones.basisLegacy' : 'zones.basisNoBounds', { ftp });
}

/** A ride's time in zones as display rows (zone, name, range or "Boundaries unknown", seconds) with its basis label. */
export function rideTimeInZones(r, kind) {
  const isP = kind === 'power', seconds = isP ? r.tizP : r.tizH;
  const meta = r.tizBasis?.[kind];
  const names = isP ? POWER_ZONE_NAMES : HR_ZONE_NAMES;
  return {
    label: tizBasisLabel(kind, meta),
    rows: (seconds || []).map((sec, i) => ({
      zone: i + 1, name: names[i], range: meta?.zones?.[i] ? zr(meta.zones[i], isP ? 'W' : 'bpm') : t('zones.unknownBoundaries'), sec,
    })),
  };
}

/** Key figures of the dashboard ride analysis as label/value pairs; formats final values, never recomputes them. */
export function rideChips(r) {
  const number = (v, digits = 0) => (v == null ? '–' : nf(v, digits));
  const m = (key) => t('metric.' + key);
  return [[m('distance'), nf(r.distance / 1000, 1) + ' km'], [m('movingTime'), fmtDur(r.moving_time)],
    [m('elevation'), nf(r.elev) + ' ' + t('units.elev')], [m(r.indoor ? 'avgSpeedVirtual' : 'avgSpeed'), nf(r.speed * 3.6, 1) + ' km/h'],
    [m('powerNp'), `${number(r.w)} / ${number(r.np)} W`],
    [m('ifTss'), `${number(r.if_, 2)} · ${number(r.tss)}`], [m('metricsFtp'), number(r.ftp) + ' W'],
    ['EF', number(r.ef, 3)], [m('hrAvgMax'), `${number(r.hr)} / ${number(r.hr_max)}`],
    [m('avgCadence'), r.cad != null ? number(r.cad) + ' rpm' : '–'],
    [m('calories'), r.kcal != null ? number(r.kcal) + ' kcal' : '–'], [m('relEffort'), number(r.re)]]
    .map(([label, value]) => ({ label, value }));
}

/** The decoupling scale: 0, the stable and the drift limit, and its end at 1.5 × the drift limit. */
export const DECOUPLING_SCALE = [0, DECOUPLING_LIMITS.stable, DECOUPLING_LIMITS.moderate, DECOUPLING_LIMITS.moderate * 1.5];
const DECOUPLING_TONE = { stable: 'positive', moderate: 'warning', drift: 'negative' };

/**
 * Decoupling of a ride for display, or null when unknown: signed value ("+4.2 %"), status text,
 * status tone (a status token) and its position on DECOUPLING_SCALE in percent (clamped to 0–100).
 */
export function rideDecoupling(dec) {
  const status = decouplingStatus(dec);
  if (status === 'unknown') return null;
  const max = DECOUPLING_SCALE.at(-1);
  return {
    status, tone: DECOUPLING_TONE[status], label: t('decoupling.' + status),
    value: `${dec >= 0 ? '+' : ''}${nf(dec, 1)} %`,
    share: Math.max(0, Math.min(100, (dec / max) * 100)),
  };
}

// Literal class names, so Tailwind generates them
const ZONE_BG = ['bg-zone-1', 'bg-zone-2', 'bg-zone-3', 'bg-zone-4', 'bg-zone-5', 'bg-zone-6', 'bg-zone-7'];
const TONE_BG = { positive: 'bg-positive', warning: 'bg-warning', negative: 'bg-negative' };

/** Background class of a zone (1–7; below 1 counts as Z1, above 7 as Z7). */
export const zoneBg = (zone) => ZONE_BG[Math.min(Math.max(zone, 1), 7) - 1];
/** Background class of a status tone. */
export const toneBg = (tone) => TONE_BG[tone];
