/**
 * Ride analysis of the dashboard: one ride of the period with its classification, key figures, time
 * in zone, aerobic decoupling and fuelling, plus its streams for the chart. Pure.
 */
import { fmtLongDate, fmtTime } from '../../scripts/format.ts';
import { rideChips, rideClassification, rideDecoupling, rideTimeInZones } from '../ride/ride-presentation.ts';
import { streamRows } from '../../lib/chart-streams.ts';
import { routes } from '../../lib/routes.ts';
import { t } from '../../i18n/index.ts';

/** The ride `id` of the period (newest first) – or null when it is not part of the period. */
export function rideAnalysis(D, id, { basis }) {
  const i = D.rides.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const r = D.rides[i], c = rideClassification(r, basis), f = D.fueling[r.id];
  const tiz = (kind) => {
    if (!(kind === 'power' ? r.tizP : r.tizH)) return null;
    return { ...rideTimeInZones(r, kind), total: D.rideTiz[r.id][kind] };
  };
  return {
    id: r.id, name: r.name, indoor: !!r.indoor, href: routes.ride(r.id),
    when: [
      fmtLongDate(r.d),
      t('common.clock', { t: fmtTime(r.d) }),
      t(r.indoor ? 'common.indoor' : 'common.outdoor'),
    ].join(' · '),
    zone: Math.min(c.zone || 1, 7), zoneLabel: c.zone ? `Z${c.zone}` : '?', classification: `${c.src} ${c.val}`,
    prs: r.pr ? t('common.prs', { n: r.pr }) : null,
    position: `${i + 1} / ${D.rides.length}`, olderId: D.rides[i + 1]?.id ?? null, newerId: D.rides[i - 1]?.id ?? null,
    chips: rideChips(r),
    tiz: { power: tiz('power'), hr: tiz('hr') },
    decoupling: rideDecoupling(r.dec) ?? { note: t('decoupling.onlyLong') },
    fuel: { during: f.during, drink: f.ml, after: f.after, cell: f.cell },
  };
}

/** Chart rows of a ride's streams for the analysis chart (power and cadence lightly smoothed), or the empty-state text. */
export function analysisStreams(st) {
  if (!st) return { empty: t('dash.deep.noStreamsRide') };
  const { rows, keys } = streamRows(st, { max: 600, smooth: 2 });
  if (!rows.length) return { empty: t('dash.deep.noStreamsRideShort') };
  return { rows, has: { watts: keys.includes('watts'), hr: keys.includes('hr'), cad: keys.includes('cad'), alt: keys.includes('alt') } };
}
