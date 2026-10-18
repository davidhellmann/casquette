/** Year reviews (server-side). */
import { loadStatRides, totals, sumTiz, maxBy, loadGear, athleteAt } from './data.js';
import { bestCurve } from '../training/index.js';
import { dkey, mondayOf, addDays } from '../scripts/format.js';
import { t } from '../i18n/index.js';

export const MONTHS = t('common.monthsShort');
export const MONTHS_L = t('common.monthsLong');
export const WEEKDAYS = t('common.weekdaysLong');

export async function yearList() {
  const rides = await loadStatRides();
  return Array.from(new Set(rides.map((r) => r.year))).sort((a, b) => b - a);
}

export async function yearData(year) {
  const all = await loadStatRides();
  const rides = all.filter((r) => r.year === year);
  const prev = all.filter((r) => r.year === year - 1);
  const t = totals(rides), tp = totals(prev);
  const now = new Date();
  const isCurrent = year === now.getFullYear();
  // Athlete state at year end (current year: today) – for the FTP line, not for legacy TIZ boundaries
  const athleteState = athleteAt(isCurrent ? now : new Date(year, 11, 31));
  const Z = athleteState.zones;
  // Previous year up to the same day (for fair comparisons in the current year)
  const sameDay = (r) => r.month < now.getMonth() || (r.month === now.getMonth() && r.d.getDate() <= now.getDate());
  const tpYtd = isCurrent ? totals(prev.filter(sameDay)) : tp;

  const months = MONTHS.map((_, m) => {
    const rs = rides.filter((r) => r.month === m);
    const tt = totals(rs);
    const tizP = sumTiz(rs, 'tizP', Z.power_zones.length);
    const tizH = sumTiz(rs, 'tizH', Z.heart_rate_zones.length);
    const wR = rs.filter((r) => r.w != null);
    const wT = wR.reduce((s, r) => s + r.moving_time, 0);
    return {
      m, rides: rs, t: tt,
      prevKm: prev.filter((r) => r.month === m).reduce((s, r) => s + r.distance / 1000, 0),
      avgW: wT ? wR.reduce((s, r) => s + r.w * r.moving_time, 0) / wT : null,
      tizP, tizH, longest: maxBy(rs, (r) => r.distance),
    };
  });

  // Weeks & streaks
  const weekKm = {};
  rides.forEach((r) => { const k = dkey(mondayOf(r.d)); weekKm[k] = (weekKm[k] || 0) + r.distance / 1000; });
  const bestWeekK = Object.entries(weekKm).sort((a, b) => b[1] - a[1])[0];
  const days = new Set(rides.map((r) => dkey(r.d)));
  let streak = 0, run = 0, streakEnd = null;
  const end = isCurrent ? now : new Date(year, 11, 31);
  for (let d = new Date(year, 0, 1); d <= end; d = addDays(d, 1)) {
    if (days.has(dkey(d))) { run++; if (run > streak) { streak = run; streakEnd = new Date(d); } } else run = 0;
  }
  const wd = Array(7).fill(0); rides.forEach((r) => wd[(r.d.getDay() + 6) % 7]++);
  const favWd = wd.indexOf(Math.max(...wd));
  const hours = rides.map((r) => r.d.getHours() + r.d.getMinutes() / 60);

  // Bikes
  const gear = await loadGear();
  const byGear = {};
  rides.forEach((r) => { if (r.gear_id) byGear[r.gear_id] = (byGear[r.gear_id] || 0) + r.distance / 1000; });
  const bikes = Object.entries(byGear).map(([id, km]) => ({ id, km, name: (gear.find((g) => g.id === id) || {}).name || id, n: rides.filter((r) => r.gear_id === id).length })).sort((a, b) => b.km - a.km);

  const outdoor = rides.filter((r) => !r.indoor);
  const highlights = {
    longest: maxBy(rides, (r) => r.distance),
    climb: maxBy(rides, (r) => r.elev),
    fastest: maxBy(outdoor.filter((r) => r.moving_time >= 1800), (r) => r.speed),
    np: maxBy(rides.filter((r) => r.moving_time >= 1200), (r) => r.np),
    hardest: maxBy(rides, (r) => r.load),
    prs: maxBy(rides, (r) => r.pr),
    earliest: rides.length ? rides.reduce((a, b) => ((a.d.getHours() * 60 + a.d.getMinutes()) <= (b.d.getHours() * 60 + b.d.getMinutes()) ? a : b)) : null,
    first: rides[rides.length - 1] || null,
    last: rides[0] || null,
  };

  return {
    year, isCurrent, athleteState, rides, prev, t, tp, tpYtd, months,
    bestMonth: months.slice().sort((a, b) => b.t.km - a.t.km)[0],
    bestWeek: bestWeekK ? { start: new Date(bestWeekK[0]), km: bestWeekK[1] } : null,
    streak, streakEnd, favWd, wd, activeDays: days.size,
    avgStart: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    bikes, highlights,
    curve: bestCurve(rides), curveAll: bestCurve(all), curvePrev: bestCurve(prev),
    tizP: sumTiz(rides, 'tizP', Z.power_zones.length), tizH: sumTiz(rides, 'tizH', Z.heart_rate_zones.length),
  };
}
