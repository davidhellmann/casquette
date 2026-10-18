/**
 * Ride list: the rows of every list of rides – ride log, recent rides, a year's and a bike's rides –
 * built from final rides (ride module or dashboard payload), on the build or in the browser. Rows
 * carry their date as a Date; build pages pass them as island props as they are (Astro serialises
 * Dates). Rendering: RideList.tsx. Pure; unit-tested in ride-list.test.js.
 */
import { eBikeKind, fuel } from '../../training/index.js';
import { rideClassification } from '../ride/ride-presentation.js';
import { fmtDur, nf } from '../../scripts/format.js';
import { t } from '../../i18n/index.js';

const num = (v) => (v == null ? undefined : v);
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

/**
 * One row per ride (shape: RideRow in ride-columns.tsx). The zone, its source and the fueling
 * (carbohydrates per hour) follow the classification `basis` – the page's zone basis, power elsewhere.
 */
export function rideRows(rides, { basis = 'power' } = {}) {
  return rides.map((r) => {
    const c = rideClassification(r, basis);
    const kind = eBikeKind(r.sport_type);
    return {
      id: String(r.id),
      date: r.d,
      name: r.name || '',
      places: r.geo?.places?.map((p) => p.name).join(' · ') || '',
      indoor: !!r.indoor,
      eBike: kind && t(`log.eBike.${kind}`),
      pr: r.pr || 0,
      km: (r.distance || 0) / 1000,
      time: r.moving_time || 0,
      elev: r.elev || 0,
      w: num(r.w),
      np: num(r.np),
      hr: num(r.hr),
      zone: num(c.zone),
      zoneBy: c.title,
      tss: num(r.tss),
      fuel: fuel(r.moving_time, c.zone).gph || undefined,
    };
  });
}

/** What the search of a ride list matches: name and places. */
export const rideSearchText = (r) => `${r.name} ${r.places}`;

/** Summary line under a ride list: "12 rides · 340 km · 14.2 h · 3,100 m". */
export const rideListSummary = (rows) => t('log.summary', {
  rides: t('common.rides', { n: nf(rows.length) }),
  km: nf(sum(rows, (r) => r.km)), h: nf(sum(rows, (r) => r.time) / 3600, 1), elev: nf(sum(rows, (r) => r.elev)),
});

/** Totals of a week or month of a ride list: "123 km · 4:30 h". */
export const rideTotals = (rows) => t('log.groupTotals', { km: nf(sum(rows, (r) => r.km)), time: fmtDur(sum(rows, (r) => r.time)) });
