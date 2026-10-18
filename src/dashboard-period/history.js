import { addDays, dkey, mondayOf } from '../scripts/format.js';
// Calendar ordinal, not elapsed local hours: stable across 23/25-hour DST days.
const doy = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000;

export function history(D, selectedDays) {
  const R = D.ridesAll, cy = D.calendarEnd.getFullYear(), td = doy(D.calendarEnd), by = {};
  let meters = 0, h = 0, elev = 0, longest = null;
  for (const r of R) {
    const y = r.d.getFullYear(), o = by[y] ||= { y, km: 0, h: 0, n: 0, elev: 0 };
    o.km += (r.distance || 0) / 1000; o.h += r.h; o.n++; o.elev += r.elev || 0;
    meters += r.distance || 0; h += r.h; elev += r.elev || 0;
    if ((r.distance || 0) > (longest?.distance || 0)) longest = r;
  }
  const years = Object.values(by).sort((a,b) => a.y-b.y);
  const ytd = y => R.filter(r => r.d.getFullYear() === y && doy(r.d) <= td).reduce((s,r) => s + (r.distance || 0),0) / 1000;
  const ytdNow = ytd(cy), ytdPrev = ytd(cy-1);
  const cumulative = years.slice(-6).reverse().map(({y}) => {
    const daily = Array(366).fill(0);
    for (const r of R) if (r.d.getFullYear() === y) daily[doy(r.d)] += (r.distance || 0) / 1000;
    let acc = 0;
    return { y, data: daily.map((v,i) => { acc += v; return y === cy && i > td ? null : Math.round(acc); }) };
  });
  D.history = { years, km: meters / 1000, h, elev, longest, best: years.slice().sort((a,b) => b.km-a.km)[0] ?? null,
    cy, multiYear: !!R.length && D.oldest.getFullYear() < cy, cumulative,
    labels: Array.from({length:366}, (_,i) => new Date(2024,0,1+i)), ytdNow, ytdPrev,
    ytdDelta: ytdPrev ? (ytdNow-ytdPrev)/ytdPrev*100 : null };

  const start = D.heatStart, end = D.calendarEnd, day = {};
  for (const r of R) {
    if (r.d < start) continue;
    const o = day[dkey(r.d)] ||= { load: 0, sec: 0, n: 0, names: [], id: r.id };
    o.load += r.load || 0; o.sec += r.moving_time || 0; o.n++;
    if (o.names.length < 3) o.names.push(r.name);
  }
  const vals = Object.values(day).map(o=>o.load).filter(v=>v>0).sort((a,b)=>a-b);
  const q = p => vals.length ? vals[Math.floor((vals.length-1)*p)] : 0;
  const q1 = q(.25), q2 = q(.5), q3 = q(.75), level = v => v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4;
  const cells = [], months = []; let lastM = -1;
  for (let w = 0; w < 53; w++) {
    const wd = addDays(start, w*7);
    if (wd.getMonth() !== lastM) { if (w < 51) months.push({ week: w, d: wd }); lastM = wd.getMonth(); }
    for (let i = 0; i < 7; i++) {
      const dt = addDays(wd,i), o = day[dkey(dt)];
      cells.push({ d:dt, week:w, rideDay:o, future:dt>end, dim:selectedDays !== 0 && D.days < 365 && dt<D.rangeStart, level:o ? level(o.load || 1) : 0 });
    }
  }
  const set = new Set(Object.keys(day)); let longestRun = 0, run = 0;
  for (let d = new Date(start); d <= end; d = addDays(d,1)) { if (set.has(dkey(d))) { run++; longestRun = Math.max(longestRun,run); } else run=0; }
  let current=0, d = new Date(end);
  if (!set.has(dkey(d))) d=addDays(d,-1);
  while (set.has(dkey(d))) { current++; d=addDays(d,-1); }
  const rw = new Set(R.map(r=>dkey(mondayOf(r.d)))); let weeks=0, w=mondayOf(end);
  if (!rw.has(dkey(w))) w=addDays(w,-7);
  while (rw.has(dkey(w))) { weeks++; w=addDays(w,-7); }
  D.heatmap = { day, cells, months, activeDays:set.size, longest:longestRun, current, weeks,
    hoursPerWeek:Object.values(day).reduce((s,o)=>s+o.sec,0)/3600/52 };
}
