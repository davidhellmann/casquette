/**
 * Ride module: frontmatter + athlete state on the ride date → final ride.
 * Pure, without Astro, file system or clock. Build I/O lives in lib/data.js.
 * Rules and contracts: docs/ride.md.
 */
import { t } from '../i18n/index.js';
import { calendarDate, countsInStats, rideLoad, zoneIdx } from '../training/index.js';
import { distributionTiz } from './distribution.js';

export { tizTotal } from './tiz-total.js';

function classifications(w, hr, re, h, zones) {
  const power = w == null ? null : { zone: zoneIdx(w, zones.power_zones) + 1, source: 'power', src: t('classification.power'), val: Math.round(w) + ' W' };
  const heart = hr == null ? null : { zone: zoneIdx(hr, zones.heart_rate_zones) + 1, source: 'hr', src: t('classification.hr'), val: Math.round(hr) + ' bpm' };
  let estimate = null;
  // Existing dashboard heuristic: effort 0 or duration 0 yields no effort estimate.
  if (re > 0 && h > 0) {
    const eph = re / h;
    const zone = eph < 35 ? 1 : eph < 70 ? 2 : eph < 110 ? 3 : 4;
    estimate = { zone, source: 'effort', src: t('classification.effort'), val: '≈ Z' + zone };
  }
  const unknown = { zone: null, source: 'none', src: '–', val: '–' };
  return { clsP: power || heart || estimate || unknown, clsH: heart || power || estimate || unknown };
}

/** Legacy histograms remain untouched: sync FTP alone never proves zone boundaries.
 * HR time in zones stored at sync keeps the zones of the sync day (or unknown ones). */
function timeInZones(m, athleteState) {
  const rebuilt = distributionTiz(m.power_distribution, athleteState.zones.power_zones);
  const legacy = m.time_in_power_zones_basis;
  const ftp = legacy?.ftp ?? m.ftp_used ?? null;
  const hrRebuilt = distributionTiz(m.hr_distribution, athleteState.zones.heart_rate_zones);
  const hrZones = m.time_in_hr_zones_basis?.zones ?? null;
  return {
    tizP: rebuilt ?? m.time_in_power_zones ?? null,
    tizH: hrRebuilt ?? m.time_in_hr_zones ?? null,
    tizBasis: {
      power: rebuilt ? {
        source: 'distribution', ftp: athleteState.ftp, zones: athleteState.zones.power_zones, exact: true,
        label: t('zones.basisFtpAtDate', { ftp: athleteState.ftp }),
      } : {
        source: m.time_in_power_zones ? 'legacy' : 'none', ftp, zones: legacy?.zones ?? null, exact: false,
        label: t('zones.basisLegacy', { ftp: ftp != null ? t('zones.basisSyncFtp', { ftp }) : t('zones.basisSyncFtpUnknown') }),
      },
      hr: hrRebuilt ? {
        source: 'distribution', zones: athleteState.zones.heart_rate_zones, exact: true, label: t('zones.basisHrAtDate'),
      } : {
        source: hrZones ? 'sync' : 'legacy', zones: hrZones, exact: false, label: t(hrZones ? 'zones.basisHrStored' : 'zones.basisHrUnknown'),
      },
    },
  };
}

/** `athleteState` is athleteTimeline(...).at(a.start_date_local); no defaults of its own. */
export function processRide(a, athleteState) {
  const m = a.metrics || {};
  const d = calendarDate(a.start_date_local);
  const instant = a.start_date == null ? NaN : +new Date(a.start_date);
  const start = Number.isFinite(instant) ? instant : null;
  const w = a.device_watts ? a.average_watts ?? null : null;
  const np = m.np ?? (a.device_watts ? a.weighted_average_watts ?? null : null);
  const hr = a.has_heartrate !== false ? a.average_heartrate ?? null : null;
  const { ftp, weight: kg, zones } = athleteState;
  const h = (a.moving_time || 0) / 3600;
  const if_ = np != null ? np / ftp : null;
  const tss = if_ != null ? Math.round(h * if_ * if_ * 100) : null;
  const ef = np != null && hr > 0 ? Math.round(np / hr * 1000) / 1000 : null;
  const re = a.suffer_score ?? null;
  return {
    id: String(a.id), name: a.name || t('ride.crumb'), sport_type: a.sport_type || 'Ride', start_local: a.start_date_local, start, d,
    year: d.getFullYear(), month: d.getMonth(), indoor: !!a.trainer || a.sport_type === 'VirtualRide', stats: countsInStats(a.sport_type || 'Ride'),
    gear_id: a.gear_id || null, gear_name: a.gear_name || null, device: a.device_name || null, commute: !!a.commute,
    distance: a.distance || 0, moving_time: a.moving_time || 0, elapsed_time: a.elapsed_time || 0, elev: a.total_elevation_gain || 0,
    speed: a.average_speed || 0, max_speed: a.max_speed || 0, w, np, max_watts: a.max_watts ?? null, kj: a.kilojoules ?? null,
    hr, hr_max: a.max_heartrate ?? null, cad: a.average_cadence ?? null, temp: a.average_temp ?? null,
    re, kcal: a.calories ?? (a.kilojoules ? Math.round(a.kilojoules) : null),
    pr: a.pr_count || 0, ach: a.achievement_count || 0, kudos: a.kudos_count || 0,
    tss, if_, ftp, kg, ef, load: rideLoad({ tss, re }), zones, ...classifications(w, hr, re, h, zones),
    avg_wkg: w != null ? Math.round(w / kg * 100) / 100 : null,
    np_wkg: np != null ? Math.round(np / kg * 100) / 100 : null,
    vi: m.variability_index ?? null,
    dec: m.decoupling_pct ?? null, best: m.power_curve || null,
    ...timeInZones(m, athleteState),
    polyline: a.summary_polyline || null, streams: !!a.streams, h,
    segs: Array.isArray(a.segment_efforts) ? a.segment_efforts : [],
    geo: a.geo && Array.isArray(a.geo.places) ? a.geo : null,
  };
}
