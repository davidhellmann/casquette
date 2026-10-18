import { calendarDay, records, sameDayLastYear, trainingCalendar, yearDayIndex, yearTotals } from '../training/index.js';

export function history(D, selectedDays) {
  const R = D.ridesAll, end = D.calendarEnd, cy = end.getFullYear(), td = yearDayIndex(end);
  let meters = 0, h = 0, elev = 0;
  for (const r of R) { meters += r.distance || 0; h += r.h; elev += r.elev || 0; }
  const years = yearTotals(R).map(({ year, ...totals }) => ({ y: year, ...totals }));
  // Year to date, compared with the previous year up to the same date (see sameDayLastYear).
  const km = rides => rides.reduce((s,r) => s + (r.distance || 0),0) / 1000;
  const ytdNow = km(R.filter(r => r.d.getFullYear() === cy));
  const lastYearCut = calendarDay(sameDayLastYear(end));
  const ytdPrev = km(R.filter(r => r.d.getFullYear() === cy - 1 && calendarDay(r.d) <= lastYearCut));
  // Cumulative kilometres on a leap reference year (labels), each ride on its month and day.
  const cumulative = years.slice(-6).reverse().map(({y}) => {
    const daily = Array(366).fill(0);
    for (const r of R) if (r.d.getFullYear() === y) daily[yearDayIndex(r.d)] += (r.distance || 0) / 1000;
    let acc = 0;
    return { y, data: daily.map((v,i) => { acc += v; return y === cy && i > td ? null : Math.round(acc); }) };
  });
  D.history = { years, km: meters / 1000, h, elev, longest: records(R).longest, best: years.slice().sort((a,b) => b.km-a.km)[0] ?? null,
    cy, multiYear: !!R.length && D.oldest.getFullYear() < cy, cumulative,
    labels: Array.from({length:366}, (_,i) => new Date(2024,0,1+i)), ytdNow, ytdPrev,
    ytdDelta: ytdPrev ? (ytdNow-ytdPrev)/ytdPrev*100 : null };

  const C = trainingCalendar(R, { from: D.heatStart, to: end, measure: 'load' });
  const day = Object.fromEntries(Object.entries(C.days).map(([key, o]) =>
    [key, { load: o.value, sec: o.sec, n: o.n, id: o.latest.id,
      rides: o.rides.map(r => ({ id: r.id, name: r.name, sec: r.moving_time || 0, load: r.load || 0 })) }]));
  const cells = C.cells.map(({ d, week, key, level, future }) => ({ d, week, rideDay: day[key], future,
    dim: selectedDays !== 0 && D.days < 365 && d < D.periodStart, level }));
  const months = []; let lastM = -1;
  for (let w = 0; w < C.weeks; w++) {
    const wd = cells[w * 7].d;
    if (wd.getMonth() !== lastM) { if (w < 51) months.push({ week: w, d: wd }); lastM = wd.getMonth(); }
  }
  D.heatmap = { day, cells, months, activeDays: C.activeDays, longest: C.longestStreak, current: C.currentStreak, weeks: C.weekStreak,
    hoursPerWeek: Object.values(day).reduce((s,o)=>s+o.sec,0)/3600/52 };
}
