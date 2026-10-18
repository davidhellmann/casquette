/** Aggregate segments from the segment efforts of all rides (server-side). */
import { loadStatRides } from './data.js';

let _segs;
export async function loadSegments() {
  if (_segs) return _segs;
  const rides = await loadStatRides();
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
        ride: r.id, rideName: r.name, d: r.d, date: r.start_local.slice(0, 10), year: r.year,
        elapsed: s.elapsed_time, moving: s.moving_time,
        w: s.device_watts === false ? null : s.average_watts ?? null,
        kg: r.kg, // body weight on the ride date (athlete state) – for W/kg
        hr: s.average_heartrate ?? null, hrMax: s.max_heartrate ?? null, cad: s.average_cadence ?? null,
        pr: s.pr_rank ?? null, kom: s.kom_rank ?? null, ach: s.achievements || [],
        si: s.start_index ?? null, ei: s.end_index ?? null, streams: r.streams, gear: r.gear_id, indoor: r.indoor,
      });
    }
  }
  _segs = Array.from(map.values()).map((g) => {
    const e = g.efforts.filter((x) => x.elapsed > 0).sort((a, b) => a.d - b.d);
    const best = e.reduce((m, x) => (!m || x.elapsed < m.elapsed ? x : m), null);
    const bestWE = e.reduce((m, x) => (x.w != null && x.w > 0 && (!m || x.w > m.w) ? x : m), null);
    const last = e[e.length - 1] || null, first = e[0] || null;
    const times = e.map((x) => x.elapsed).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    // running best time (PR progression)
    let run = Infinity;
    const prog = e.map((x) => (run = Math.min(run, x.elapsed)));
    return {
      ...g, efforts: e, n: e.length, best, last, first, median, prog,
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
  return _segs;
}
export const segmentPages = async () => (await loadSegments()).filter((s) => s.n >= 2);
