/**
 * Ride analysis of the dashboard: one ride of the period with its classification, key figures, time
 * in zone, aerobic decoupling and fuelling, plus its streams for the chart. Pure.
 */
import { nf, fmtLongDate, fmtTime } from '../../scripts/format.js';
import { classificationText, dashboardTiz, rideChips } from '../../scripts/dashboard-display.js';
import { thin } from '../charts/series.ts';
import { t } from '../../i18n/index.js';

const DECOUPLING_TONE = { stable: 'positive', moderate: 'warning', drift: 'negative' };

/** The ride `id` of the period (newest first) – or null when it is not part of the period. */
export function rideAnalysis(D, id, { basis, base = '/' }) {
  const i = D.rides.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const r = D.rides[i], c = basis === 'hr' ? r.clsH : r.clsP, text = classificationText(r, c), f = D.fueling[r.id];
  const tiz = (kind) => {
    if (!(kind === 'power' ? r.tizP : r.tizH)) return null;
    const { label, rows } = dashboardTiz(r, kind);
    return { label, rows: rows.map(({ z, ...row }) => ({ zone: z, ...row })), total: D.rideTiz[r.id][kind] };
  };
  const dc = r.dec, status = D.decoupling[r.id];
  return {
    id: r.id, name: r.name, indoor: !!r.indoor, href: `${base}rides/${r.id}`,
    when: [
      fmtLongDate(r.d),
      t('common.clock', { t: fmtTime(r.d) }),
      t(r.indoor ? 'common.indoor' : 'common.outdoor'),
    ].join(' · '),
    zone: Math.min(c.zone || 1, 7), zoneLabel: c.zone ? `Z${c.zone}` : '?', classification: `${text.src} ${text.val}`,
    prs: r.pr ? t('common.prs', { n: r.pr }) : null,
    position: `${i + 1} / ${D.rides.length}`, olderId: D.rides[i + 1]?.id ?? null, newerId: D.rides[i - 1]?.id ?? null,
    chips: rideChips(r).map(([label, value]) => ({ label, value })),
    tiz: { power: tiz('power'), hr: tiz('hr') },
    decoupling: dc == null ? { note: t('decoupling.onlyLong') } : {
      value: `${dc >= 0 ? '+' : ''}${nf(dc, 1)} %`, label: t('decoupling.' + status), tone: DECOUPLING_TONE[status],
      share: Math.max(0, Math.min(100, (dc / 15) * 100)),
    },
    fuel: { during: f.during, drink: f.ml, after: f.after, cell: f.cell },
  };
}

/** Moving average over ±w samples (display only), rounded like the old chart. */
const smooth = (arr, w) => arr.map((_, i) => {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) if (arr[j] != null) { s += arr[j]; n++; }
  return n ? Math.round(s / n) : null;
});

/** Chart rows of a ride's streams (power and cadence lightly smoothed, thinned for display). */
export function streamRows(st) {
  if (!st || st.error) return { empty: t('dash.deep.noStreamsRide') };
  const n = (st.time || st.watts || st.heart_rate || []).length;
  if (!n) return { empty: t('dash.deep.noStreamsRideShort') };
  const time = st.time || Array.from({ length: n }, (_, i) => i);
  const watts = st.watts && smooth(st.watts, 2), cadence = st.cadence && smooth(st.cadence, 2);
  const altitude = st.altitude && st.altitude.some((v) => v) ? st.altitude : null;
  const rows = time.map((s, i) => ({
    minute: Math.round(s / 60),
    watts: watts ? watts[i] : null, hr: st.heart_rate ? st.heart_rate[i] ?? null : null,
    cadence: cadence ? cadence[i] : null, altitude: altitude ? altitude[i] ?? null : null,
  }));
  return { has: { watts: !!watts, hr: !!st.heart_rate, cadence: !!cadence, altitude: !!altitude }, rows: thin(rows, 600, 900) };
}
