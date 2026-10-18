/**
 * Build payload of a ride page (/rides/<id>) from the build dataset: header, key data, map, zones,
 * power curve against the year's and all-time bests, analysis and tables. Locale-dependent texts are
 * formatted here. Build time.
 */
import type { RidePayload } from '../components/ride/RideView';
import type { LatLng } from '../components/ride/RideMap';
import type { BuildDataset } from './build-dataset.ts';
import { routes } from './routes.ts';
import { activityUrl, segmentUrl } from './strava-links.ts';
import { rideClassification, tizBasisLabel } from '../components/ride/ride-presentation.ts';
import { decodePolyline } from '../scripts/polyline.ts';
import { curveLabel, fmtLongDate, fmtTime } from '../scripts/format.ts';
import { bestCurve, fuel } from '../training/index.ts';
import { t } from '../i18n/index.ts';

const watts = (best: Record<string, { w: number }>) => Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.w]));
const pick = (o: Record<string, any>, keys: string[]): any => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
const link = (r: { id: string; name: string } | undefined) => (r ? { href: routes.ride(r.id), name: r.name } : null);

/**
 * Every ride has a page; older/newer follow the ride order of the dataset. Bests compare with the
 * admitted stat rides: new power bests (GLOSSARY) are all-time bests as of today – strictly above every
 * other stat ride, later ones included.
 */
export function ridePayload(data: BuildDataset, { id }: { id: string }): RidePayload {
  const i = data.rides.findIndex((x) => x.id === String(id));
  if (i < 0) throw new Error(`No ride ${id}`);
  const r = data.rides[i];
  // The ride module provides the same athlete state for metrics, streams and W/kg.
  const Z = r.zones, KG = r.kg;
  const others = data.calendar.statRides.filter((x) => x.id !== r.id);
  const allBest = bestCurve(others);
  const yearBest = bestCurve(others.filter((x) => x.year === r.year));
  const st = data.streams(r.id);
  const gear = data.gear.find((g) => g.id === r.gear_id);
  const hasLatlng = !!st?.latlng;
  const points = hasLatlng ? null : decodePolyline(r.polyline) as LatLng[];
  const mapKey = hasLatlng ? (st.watts ? 'watts' : st.heart_rate ? 'heart_rate' : null) : null;
  const newBests = Object.entries(r.best || {}).filter(([k, w]: [string, any]) => w && (!allBest[k] || w > allBest[k].w)).map(([k]) => +k);
  const f = fuel(r.moving_time, r.clsP.zone);

  return {
    id: r.id,
    name: r.name,
    kind: `${t(r.indoor ? 'common.indoor' : 'common.outdoor')} · ${r.sport_type}`,
    indoor: r.indoor,
    inStats: r.stats,
    when: `${fmtLongDate(r.d)} · ${t('common.clock', { t: fmtTime(r.d) })}`,
    zone: r.clsP.zone ? { zone: r.clsP.zone, title: rideClassification(r).title, estimated: r.clsP.source === 'effort' } : null,
    gear: gear ? { name: gear.name, href: routes.gear(gear.id) } : null,
    device: r.device,
    prs: r.pr,
    newBests: newBests.length ? newBests.map(curveLabel).join(', ') : null,
    strava: activityUrl(r.id),
    places: (r.geo?.places || []).map((p) => ({
      name: p.name,
      href: routes.map({ country: p.country || '', place: p.name }),
      title: [p.region, p.country].filter(Boolean).join(', '),
    })),
    older: link(data.rides[i + 1]),
    newer: link(data.rides[i - 1]),
    stats: {
      distance: r.distance / 1000, moving: r.moving_time, elapsed: r.elapsed_time, elev: r.elev,
      elevLow: r.elev_low, elevHigh: r.elev_high, speed: r.speed * 3.6, maxSpeed: r.max_speed * 3.6,
      w: r.w, maxW: r.max_watts, np: r.np, hr: r.hr, maxHr: r.hr_max, cad: r.cad, kcal: r.kcal, kj: r.kj,
      tss: r.tss, ftp: r.ftp, if_: r.if_, re: r.re, temp: r.temp, kg: KG,
    },
    map: {
      streams: !!st,
      points: points && points.filter(Boolean).length > 1 ? points : null,
      key: mapKey,
      zones: mapKey === 'watts' ? Z.power_zones : mapKey === 'heart_rate' ? Z.heart_rate_zones : null,
    },
    streamZones: { watts: Z.power_zones, hr: Z.heart_rate_zones },
    tiz: {
      power: { seconds: r.tizP, zones: r.tizBasis.power.zones, label: tizBasisLabel('power', r.tizBasis.power) },
      hr: { seconds: r.tizH, zones: r.tizBasis.hr.zones, label: tizBasisLabel('hr', r.tizBasis.hr) },
    },
    year: r.year,
    ftp: Z.ftp,
    curve: {
      own: r.best || {},
      year: watts(yearBest),
      allTime: watts(allBest),
      wkg: {
        own: Object.fromEntries(Object.entries(r.best || {}).map(([k, w]: [string, any]) => [k, +(w / KG).toFixed(2)])),
        year: data.curveWkg(yearBest),
        allTime: data.curveWkg(allBest),
      },
    },
    analysis: { if_: r.if_, vi: r.vi, ef: r.ef, rpe: r.rpe, dec: r.dec, fuel: { during: f.during, ml: f.ml, after: f.after } },
    laps: r.laps.length > 1 ? r.laps.map((l, n) => ({ ...pick(l, ['name', 'distance', 'moving_time', 'average_speed', 'average_watts', 'average_heartrate', 'max_heartrate', 'average_cadence', 'total_elevation_gain']), index: l.lap_index ?? n + 1 })) : [],
    segments: r.segs.map((s, n) => ({ ...pick(s, ['name', 'distance', 'average_grade', 'elapsed_time', 'average_watts', 'average_heartrate', 'pr_rank']), key: `${n}`, href: segmentUrl(s.segment_id) })),
    splits: r.splits.length > 1 && !r.indoor ? r.splits.map((s) => pick(s, ['split', 'moving_time', 'average_speed', 'elevation_difference', 'average_heartrate'])) : [],
  };
}
