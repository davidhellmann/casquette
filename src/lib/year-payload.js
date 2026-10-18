/**
 * Build payloads of the years overview (/years) and the year review (/years/<year>): plain,
 * serialisable data for the React views in src/components/years/. Server-side (build time).
 */
import { BASE } from '../components/app/nav.ts';
import { loadStatRides, curveWkg } from './data.js';
import { yearData, MONTHS, MONTHS_L, WEEKDAYS } from './years.js';
import { POWER_ZONE_NAMES, yearTotals } from '../training/index.js';
import { yearCalendar } from './year-calendar.js';
import { rideRows } from '../components/rides/ride-list.js';
import { nf, fmtDateL, fmtTime } from '../scripts/format.js';
import { t } from '../i18n/index.js';

const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
const yt = (key, p) => t('year.' + key, p);

/** /years: every year with its totals and kilometres per month, newest first. */
export async function yearsIndexPayload() {
  const rides = await loadStatRides();
  const byYear = new Map(yearTotals(rides).map((y) => [y.year, y]));
  const cy = new Date().getFullYear();
  const list = [...byYear.values()].reverse().map(({ year: y, km, h, n, elev }) => {
    const rs = rides.filter((r) => r.year === y), prevKm = byYear.get(y - 1)?.km;
    return {
      year: y, current: y === cy, km, h, n, elev,
      delta: y !== cy && prevKm ? pct(km, prevKm) : null,
      months: MONTHS.map((_, m) => rs.filter((r) => r.month === m).reduce((s, r) => s + r.distance / 1000, 0)),
    };
  });
  const best = list.slice().sort((a, b) => b.km - a.km)[0] || null;
  return { base: BASE, years: list, rides: rides.length, best: best && { year: best.year, km: best.km }, months: MONTHS, monthsLong: MONTHS_L };
}

/** /years/<year>: key figures, months, calendar, intensity, power curve, bikes, highlights and rides. */
export async function yearPayload(year) {
  const Y = await yearData(year);
  const base = BASE;
  const Z = Y.athleteState.zones;
  const { t: tt, tpYtd: tp } = Y;
  const weeks = Y.isCurrent ? Math.max(1, (Date.now() - new Date(year, 0, 1)) / 604800000) : 52.14;
  const tip = yt(Y.isCurrent ? 'vsSameDay' : 'vsYear', { y: year - 1 });
  const hasPrev = Y.prev.length > 0;
  const delta = (a, b) => (hasPrev ? pct(a, b) : null);
  const per = (f) => Y.months.map((m) => f(m));
  const activeDays = (rs) => new Set(rs.map((r) => r.d.toDateString())).size;

  const kpis = [
    { key: 'km', label: yt('km'), value: tt.km, unit: 'km', pct: delta(tt.km, tp.km), secondary: yt('prevVal', { y: year - 1, v: `${nf(tp.km)} km` }), spark: per((m) => m.t.km), series: 'distance', fromZero: true },
    { key: 'rides', label: yt('rides'), value: tt.n, pct: delta(tt.n, tp.n), secondary: yt('prevVal', { y: year - 1, v: nf(tp.n) }), spark: per((m) => m.t.n), series: 'rides', fromZero: true },
    { key: 'hours', label: yt('hours'), value: tt.h, unit: 'h', pct: delta(tt.h, tp.h), secondary: yt('prevVal', { y: year - 1, v: `${nf(tp.h)} h` }), spark: per((m) => m.t.h), series: 'time', fromZero: true },
    { key: 'elev', label: yt('elev'), value: tt.elev, unit: t('units.elev'), pct: delta(tt.elev, tp.elev), secondary: t('common.everestShort', { n: nf(tt.elev / 8849, 1) }), spark: per((m) => m.t.elev), series: 'elevation', fromZero: true },
    { key: 'week', label: yt('perWeek'), value: tt.km / weeks, unit: 'km', secondary: yt('perWeekSub', { h: nf(tt.h / weeks, 1), n: nf(tt.n / weeks, 1) }), series: 'distance' },
    { key: 'days', label: yt('activeDays'), value: Y.activeDays, secondary: yt('longestStreak', { n: Y.streak }), spark: per((m) => activeDays(m.rides)), series: 'rides', fromZero: true },
    { key: 'tss', label: yt('load'), value: tt.tss, unit: 'TSS', pct: delta(tt.tss, tp.tss), secondary: yt('perWeekTss', { v: nf(tt.tss / weeks) }), spark: per((m) => m.t.tss), series: 'load', fromZero: true },
    { key: 'kj', label: yt('energy'), value: tt.kj, unit: 'kJ', secondary: yt('kaiserschmarrn', { n: nf(tt.kj / 650) }), spark: per((m) => m.t.kj), series: 'power', fromZero: true },
    { key: 'prs', label: t('metric.prs'), value: tt.pr, pct: delta(tt.pr, tp.pr), secondary: yt('prsSub', { ach: nf(tt.ach), kudos: nf(tt.kudos) }), spark: per((m) => m.t.pr), series: 'prs', fromZero: true },
    { key: 'indoor', label: yt('indoorShare'), value: tt.h ? (tt.indoorH / tt.h) * 100 : null, unit: '%', secondary: yt('indoorSub', { h: nf(tt.indoorH, 1) }), series: 'time' },
  ].map((k) => ({ ...k, tip }));

  const months = Y.months.map((m) => {
    const { seconds, total } = m.tiz, tiz = total ? seconds : null;
    return {
      m: m.m, label: MONTHS[m.m], long: MONTHS_L[m.m],
      n: m.t.n, km: m.t.km, h: m.t.h, elev: m.t.elev, tss: m.t.tss, prevKm: m.prevKm, avgW: m.avgW,
      zones: tiz ? tiz.map((s) => (s / total) * 100) : null,
      longest: m.longest ? { href: `${base}rides/${m.longest.id}`, name: m.longest.name, km: m.longest.distance / 1000 } : null,
      best: !!(Y.bestMonth && Y.bestMonth.m === m.m && m.t.km > 0),
    };
  });

  const outdoor = Y.rides.filter((r) => !r.indoor);
  const outdoorSec = outdoor.reduce((a, r) => a + r.moving_time, 0);
  const clock = (h) => t('common.clock', { t: `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}` });
  const glance = [
    { label: yt('bestMonth'), value: Y.bestMonth && Y.bestMonth.t.km ? `${MONTHS_L[Y.bestMonth.m]} · ${nf(Y.bestMonth.t.km)} km` : '–' },
    { label: yt('bestWeek'), value: Y.bestWeek ? `${nf(Y.bestWeek.km)} km` : '–', sub: Y.bestWeek ? yt('from', { d: fmtDateL(Y.bestWeek.start) }) : undefined },
    { label: yt('streak'), value: yt('streakVal', { n: Y.streak }) },
    { label: yt('favDay'), value: tt.n ? WEEKDAYS[Y.favWd] : '–' },
    { label: yt('avgStart'), value: Y.avgStart != null ? clock(Y.avgStart) : '–' },
    { label: yt('favBike'), value: Y.bikes[0] ? Y.bikes[0].name : '–' },
    { label: yt('avgDist'), value: tt.n ? `${nf(tt.km / tt.n, 1)} km` : '–' },
    { label: yt('avgSpeedOut'), value: outdoorSec ? `${nf((outdoor.reduce((a, r) => a + r.distance, 0) / outdoorSec) * 3.6, 1)} km/h` : '–' },
  ];

  const H = Y.highlights;
  const time = fmtTime;
  const hl = (key, label, r, v) => ({ key, label, value: r ? v(r) : '–', ride: r ? { href: `${base}rides/${r.id}`, name: r.name } : null });
  const highlights = [
    hl('longest', yt('hl.longest'), H.longest, (r) => `${nf(r.distance / 1000, 1)} km`),
    hl('climb', yt('hl.climb'), H.climb, (r) => `${nf(r.elev)} ${t('units.elev')}`),
    hl('fastest', yt('hl.fastest'), H.fastest, (r) => `${nf(r.speed * 3.6, 1)} km/h`),
    hl('np', yt('hl.np'), H.np, (r) => `${Math.round(r.np)} W`),
    hl('hardest', yt('hl.hardest'), H.hardest, (r) => (r.tss != null ? `${nf(r.tss)} TSS` : `${nf(r.re)}${t('dash.records.effort')}`)),
    hl('prs', yt('hl.prs'), H.prs, (r) => t('common.prs', { n: r.pr })),
    hl('earliest', yt('hl.earliest'), H.earliest, (r) => t('common.clock', { t: time(r.d) })),
    hl('last', yt(Y.isCurrent ? 'hl.last' : 'hl.lastOfYear'), H.last, (r) => fmtDateL(r.d)),
  ];

  const watts = (best) => Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.w]));
  return {
    year, isCurrent: Y.isCurrent, base, kpis, months, glance, highlights,
    calendar: yearCalendar(Y.calendar, year, { base }),
    calendarStats: [
      { value: nf(Y.activeDays), label: yt('activeDays').toLowerCase() },
      { value: nf(Y.streak), label: yt('streakDays') },
      { value: Y.bestWeek ? nf(Y.bestWeek.km) : '–', label: yt('bestWeekKm') },
      { value: nf(tt.h / weeks, 1), label: yt('hoursWeek') },
    ],
    tizP: Y.tiz.rides ? Y.tiz.seconds : null,
    tizNote: Y.tiz.total && Y.tiz.mixed ? t('zones.legacyNote') : null,
    zoneNames: POWER_ZONE_NAMES.slice(0, Z.power_zones.length),
    curves: { all: watts(Y.curveAll), d90: watts(Y.curve), ly: watts(Y.curvePrev) },
    curveWkg: { all: await curveWkg(Y.curveAll), d90: await curveWkg(Y.curve), ly: await curveWkg(Y.curvePrev) },
    bikes: Y.bikes.map((b) => ({ href: `${base}gear/${b.id}`, name: b.name, km: b.km, n: b.n })),
    rides: rideRows(Y.rides),
  };
}
