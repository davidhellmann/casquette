/**
 * Intensity cards of the dashboard period: volume by zone per week/month, time by zone, time in zone
 * from the ride histograms, rhythm (weekday, hour, indoor/outdoor) and power & heart rate per ride.
 * Pure; `null` = the card shows its empty state. Rounding as shown.
 */
import { fmtDate, fmtDateL, fmtDur, fmtH, nf, trunc, fmtMonthYear, fmtMonthYearShort } from '../../scripts/format.js';
import { isoWeek } from '../../training/index.js';
import { HR_ZONE_NAMES, POWER_ZONE_NAMES } from '../../training/index.js';
import { t } from '../../i18n/index.js';

const zoneNames = (basis) => (basis === 'hr' ? HR_ZONE_NAMES : POWER_ZONE_NAMES);

/** Hours per calendar week (or month for long periods), stacked by zone 1 … 5+ and "no data". */
export function zoneWeeks(D, basis) {
  if (!D.rides.length) return null;
  const { monthly, buckets } = D.weekly;
  const names = t(basis === 'hr' ? 'zones.bucketsHr' : 'zones.bucketsPower');
  return {
    monthly,
    series: [1, 2, 3, 4, 5].map((z) => ({ key: `z${z}`, zone: z, label: names[z - 1] })),
    unknown: buckets.some((w) => w.u > 0) ? { key: 'u', label: t('dash.chart.noDataSeries') } : null,
    rows: buckets.map((w) => ({
      label: monthly ? fmtMonthYearShort(w.d) : `${t('common.weekPrefix')} ${isoWeek(w.d)}`,
      title: monthly ? fmtMonthYear(w.d) : t('dash.chart.weekFrom', { d: fmtDate(w.d) }),
      ...Object.fromEntries([1, 2, 3, 4, 5].map((z) => [`z${z}`, +w.z[z].toFixed(2)])),
      u: +w.u.toFixed(2),
      total: t('common.total', { v: fmtH(w.tooltipTotal) }),
    })),
  };
}

/** Ride time per zone of the ride classification (donut). */
export function zoneShare(D, basis) {
  const S = D.S, names = zoneNames(basis), zs = [];
  for (let z = 1; z <= 7; z++) if (S.zt[z] > 0) zs.push(z);
  if (!zs.length) return null;
  const total = S.ztot / 3600;
  return {
    total: `${nf(total, total > 100 ? 0 : 1)} h`, sub: t('dash.chart.classified'),
    rows: zs.map((z) => {
      const hours = +(S.zt[z] / 3600).toFixed(2);
      const pct = `${nf((hours / total) * 100, 0)} %`;
      return { zone: z, label: `Z${z} ${names[z - 1] || ''}`.trim(), hours, pct, value: `${fmtH(hours)} · ${pct}` };
    }),
  };
}

/** Time in zone from the ride histograms (incl. legacy) for power or heart rate. */
export function timeInZones(D, basis) {
  const X = D.S.exact, isP = basis !== 'hr', seconds = isP ? X.p : X.h, rides = isP ? X.np : X.nh;
  const { total, z2Percent } = D.tiz[isP ? 'power' : 'hr'];
  if (!rides || !total) return { empty: t('dash.exact.noData', { kind: t(isP ? 'metric.power' : 'metric.hr') }) };
  const x = (key) => t('dash.exact.' + key), names = zoneNames(basis);
  return {
    figures: [[`${nf(z2Percent, 0)} %`, x('z2Share')], [fmtDur(seconds[1]), x('z2Total')], [nf(rides), x('withData')]],
    note: t('zones.legacyNote'), total,
    rows: seconds.map((sec, i) => ({ zone: i + 1, name: names[i], range: t('zones.perRide'), sec })),
  };
}

/** When and where: hours per weekday, starts per hour, indoor vs. outdoor time. */
export function rhythm(D) {
  if (!D.rides.length) return null;
  const { weekdays, hours, indoor, outdoor } = D.rhythm, total = D.rhythm.total || 1;
  const maxDay = Math.max(...weekdays), maxHour = Math.max(...hours);
  const io = (key, h) => ({ key, label: t('common.' + key), hours: fmtH(h), share: (h / total) * 100, pct: `${nf((h / total) * 100)} %` });
  return {
    weekdays: weekdays.map((v, i) => ({ label: t('common.weekdaysShort')[i], hours: +v.toFixed(1), top: v === maxDay && maxDay > 0, value: fmtH(+v.toFixed(1)) })),
    hours: hours.map((n, i) => ({ label: String(i), starts: n, top: n === maxHour && maxHour > 0,
      title: t('dash.chart.hourRange', { h: String(i) }), value: t('dash.chart.starts', { n }) })),
    split: [io('outdoor', outdoor), io('indoor', indoor)],
  };
}

/** Average power and heart rate of each ride (oldest first), Z2 power window as a band. */
export function powerHr(D, zones) {
  const L = D.powerHr;
  if (!L.length) return null;
  const long = D.days > 400, round = (v) => (v != null ? Math.round(v) : null);
  return {
    z2: { from: zones.power_zones[1].min, to: zones.power_zones[1].max },
    rows: L.map((r) => ({
      id: r.id, label: long ? fmtDateL(r.d) : fmtDate(r.d), name: trunc(r.name, 44),
      meta: `${fmtDateL(r.d)} · ${fmtDur(r.moving_time)} · ${nf(r.distance / 1000, 1)} km`,
      w: round(r.w), hr: round(r.hr), np: round(r.np), hrMax: r.hr_max ?? null,
      ef: r.ef != null ? `EF ${nf(r.ef, 2)} W/bpm` : null,
    })),
  };
}
