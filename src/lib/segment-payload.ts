/**
 * Build payloads of the segment pages (/segments, /segments/<id>) from the build dataset: segments
 * (GLOSSARY) aggregated from the segment efforts of the admitted stat rides, with their bests. Build time.
 */
import type { SegmentsPayload } from '../components/segments/SegmentsView';
import type { SegmentPayload } from '../components/segments/SegmentView';
import type { BuildDataset } from './build-dataset.js';
import { segmentUrl } from './strava-links.js';
import { rideDate } from '../training/index.js';
import { t } from '../i18n/index.js';

/** Segments with their own page: ridden at least twice. */
const hasPage = (g) => g.n >= 2;

const cache = new WeakMap<BuildDataset, any[]>();
/** Every segment with its efforts (date order) and bests, most ridden first; aggregated once per dataset. */
function segments(data: BuildDataset) {
  if (!cache.has(data)) cache.set(data, aggregate(data.calendar.statRides));
  return cache.get(data);
}

/** Ids of the segments with their own page. */
export const segmentPageIds = (data: BuildDataset): string[] => segments(data).filter(hasPage).map((g) => g.id);

/** /segments: totals, the most ridden segment and one row per segment. */
export function segmentsIndexPayload(data: BuildDataset): SegmentsPayload {
  const segs = segments(data);
  const fav = segs[0];
  return {
    climbs: segs.filter((g) => g.isClimb).length,
    attempts: segs.reduce((s, g) => s + g.n, 0),
    prs: segs.reduce((s, g) => s + g.prs, 0),
    fav: fav ? { id: fav.id, name: fav.name, n: fav.n, page: hasPage(fav) } : null,
    rows: segs.map((g) => ({
      id: g.id, name: g.name, city: g.city || '', km: g.distance / 1000, grade: g.grade ?? undefined, attempts: g.n,
      best: g.best?.elapsed ?? undefined, bestW: g.best?.w ?? undefined, bestOn: g.best?.date ?? undefined, last: g.last?.date ?? undefined,
      lastDelta: hasPage(g) ? g.lastDelta ?? undefined : undefined, climb: g.isClimb, virtual: g.indoor, page: hasPage(g), strava: segmentUrl(g.id),
    })),
  };
}

/** /segments/<id>: a segment ridden at least twice, its attempts and the fastest attempts with streams. */
export function segmentPayload(data: BuildDataset, { id }: { id: string }): SegmentPayload {
  const seg = segments(data).find((g) => g.id === String(id) && hasPage(g));
  if (!seg) throw new Error(`No segment page ${id}`);
  const gearName = Object.fromEntries(data.gear.map((g) => [g.id, g.name]));
  const e = seg.efforts;
  const effort = (x) => ({ date: x.date, t: x.elapsed });
  // The three fastest attempts with second-by-second data: the map and the elevation profile use the first that loads
  const tracks = e.filter((x) => x.streams && x.si != null && x.ei != null).sort((a, b) => a.elapsed - b.elapsed).slice(0, 3).map((x) => ({ ride: x.ride, si: x.si, ei: x.ei }));
  return {
    id: seg.id,
    name: seg.name,
    tags: [seg.city, seg.indoor ? t('segments.virtual') : null, t('segments.cat')[seg.climb || 0] || null].filter(Boolean),
    distance: seg.distance,
    grade: seg.grade,
    strava: segmentUrl(seg.id),
    best: effort(seg.best),
    bestSpeed: seg.bestSpeed,
    median: seg.median,
    last: effort(seg.last),
    lastDelta: seg.lastDelta,
    first: effort(seg.first),
    improvement: seg.improvement,
    bestW: seg.bestW,
    bestWkg: seg.bestWkg,
    prs: seg.prs,
    efforts: e.map((x) => ({
      ride: x.ride, name: x.rideName, date: x.date, t: x.elapsed, w: x.w, hr: x.hr, cad: x.cad, kg: x.kg, pr: x.pr, bike: gearName[x.gear] || null,
    })),
    tracks,
  };
}

/** Segment efforts of the rides → segments with their efforts in date order and their bests. */
function aggregate(rides) {
  const map = new Map();
  for (const r of rides) {
    for (const s of r.segs) {
      if (s.segment_id == null) continue;
      const id = String(s.segment_id);
      let g = map.get(id);
      if (!g) {
        g = { id, name: s.name || 'Segment', distance: s.distance || 0, grade: s.average_grade ?? null, climb: s.climb_category ?? 0, city: s.city || null, efforts: [] };
        map.set(id, g);
      }
      g.efforts.push({
        ride: r.id, rideName: r.name, d: r.d, date: rideDate(r), year: r.year,
        elapsed: s.elapsed_time, moving: s.moving_time,
        w: s.device_watts === false ? null : s.average_watts ?? null,
        kg: r.kg, // body weight on the ride date (athlete state) – for W/kg
        hr: s.average_heartrate ?? null, hrMax: s.max_heartrate ?? null, cad: s.average_cadence ?? null,
        pr: s.pr_rank ?? null, kom: s.kom_rank ?? null, ach: s.achievements || [],
        si: s.start_index ?? null, ei: s.end_index ?? null, streams: r.streams, gear: r.gear_id, indoor: r.indoor,
      });
    }
  }
  return Array.from(map.values()).map((g) => {
    const e = g.efforts.filter((x) => x.elapsed > 0).sort((a, b) => a.d - b.d);
    const best = e.reduce((m, x) => (!m || x.elapsed < m.elapsed ? x : m), null);
    const bestWE = e.reduce((m, x) => (x.w != null && x.w > 0 && (!m || x.w > m.w) ? x : m), null);
    const last = e[e.length - 1] || null, first = e[0] || null;
    const times = e.map((x) => x.elapsed).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    return {
      ...g, efforts: e, n: e.length, best, last, first, median,
      bestSpeed: best && best.elapsed ? (g.distance / best.elapsed) * 3.6 : null,
      bestW: bestWE ? bestWE.w : null,
      bestWkg: bestWE ? bestWE.w / bestWE.kg : null, // with the body weight on the date of this effort
      improvement: first && best && first.elapsed ? ((first.elapsed - best.elapsed) / first.elapsed) * 100 : null,
      lastDelta: last && best && best.elapsed ? ((last.elapsed - best.elapsed) / best.elapsed) * 100 : null,
      prs: e.filter((x) => x.pr === 1).length,
      isClimb: (g.grade ?? 0) >= 3 && g.distance >= 300,
      indoor: e.every((x) => x.indoor),
    };
  }).filter((g) => g.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
