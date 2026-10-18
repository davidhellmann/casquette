/**
 * The training calendar of a year review: one cell per day from the Monday before 1 January to the
 * Sunday after 31 December, coloured by the day's kilometres (quartiles of the year's ride days).
 * Pure – the result is what the TrainingCalendar component draws.
 */
import { addDays, dkey, mondayOf, nf, trunc, fmtWeekdayDate, fmtMonthShort } from '../scripts/format.js';
import { t } from '../i18n/index.js';

const DAY = 86400000;
/** Whole days from a to b (DST-safe). */
const daysBetween = (a, b) => Math.round((b - a) / DAY);

/**
 * @param {{ id: string|number, d: Date, distance: number, name?: string }[]} rides – the year's rides
 * @returns {{ days: (object|null)[], weeks: number, months: { week: number, label: string }[] }}
 */
export function yearCalendar(rides, year, { base, today = new Date() }) {
  const start = mondayOf(new Date(year, 0, 1));
  const end = addDays(mondayOf(new Date(year, 11, 31)), 6);
  const byDay = {};
  for (const r of rides.slice().sort((a, b) => a.d - b.d)) (byDay[dkey(r.d)] ??= []).push(r);
  const kmOf = (rs) => rs.reduce((s, r) => s + r.distance / 1000, 0);
  const sorted = Object.values(byDay).map(kmOf).sort((a, b) => a - b);
  const q = (p) => (sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0);
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const last = dkey(today);

  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (d.getFullYear() !== year || dkey(d) > last) { days.push(null); continue; }
    const title = fmtWeekdayDate(d);
    const rs = byDay[dkey(d)];
    if (!rs) { days.push({ level: 0, title, notes: [t('common.restDay')] }); continue; }
    const km = kmOf(rs);
    days.push({
      level: km <= q1 ? 1 : km <= q2 ? 2 : km <= q3 ? 3 : 4,
      title,
      detail: t('year.calTip', { rides: t('common.rides', { n: nf(rs.length) }), km: nf(km, 1) }),
      notes: rs.map((r) => trunc(r.name, 40)),
      href: `${base}rides/${rs[0].id}`,
    });
  }
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year, m, 1);
    return { week: Math.floor(daysBetween(start, first) / 7), label: fmtMonthShort(first) };
  });
  return { days, weeks: days.length / 7, months };
}
