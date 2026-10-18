// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * History and records of the dashboard: all-time totals, years compared, the cumulative kilometre
 * race, and the records of the period. Pure; rounding as shown.
 */
import { fmtDateL, fmtDur, nf, trunc, fmtDayMonth, fmtMonthShort } from '../../scripts/format.ts';
import { t } from '../../i18n/index.ts';

const rides = (n) => t('common.rides', { n: nf(n) });

/** Rides since the first year – the subline of the history cards. */
export const historySince = (D) => t('common.sinceYear', { rides: rides(D.ridesAll.length), year: D.oldest.getFullYear() });

/** All-time totals with a fun comparison each, the best year and the longest ride. */
export function allTime(D) {
  const R = D.ridesAll, { km, h, elev, best, longest } = D.history, a = (key, x) => t('dash.allTime.' + key, x);
  return {
    items: [
      { key: 'km', value: nf(km), label: a('km'), sub: a('kmSub', { n: nf(km / 40075, 1) }) },
      { key: 'h', value: nf(h), label: a('hours'), sub: a('hoursSub', { n: nf(h / 24, 0) }) },
      { key: 'elev', value: nf(elev), label: a('elev'), sub: t('common.everest', { n: nf(elev / 8849, 1) }) },
      { key: 'rides', value: nf(R.length), label: a('rides'), sub: a('ridesSub', { n: nf(R.length ? km / R.length : 0) }) },
      ...(best ? [{ key: 'best', value: nf(best.km), label: a('bestYear', { y: best.y }), sub: rides(best.n) }] : []),
    ],
    longest: longest ? { id: longest.id, value: `${nf(longest.distance / 1000, 1)} km`, label: a('longest'), name: trunc(longest.name, 32) } : null,
  };
}

/** Kilometres (bars) and hours (line) per year; the current year highlighted. */
export function yearsCompared(D) {
  const { years, cy } = D.history;
  if (!years.length) return null;
  return years.map((y) => ({
    year: String(y.y), km: Math.round(y.km), h: +y.h.toFixed(1), current: y.y === cy,
    footer: t('dash.chart.yearFooter', { rides: rides(y.n), elev: nf(y.elev) }) + (y.y === cy ? t('dash.chart.soFar') : ''),
  }));
}

/** Cumulative kilometres per day of the year for the last six years; this year so far vs. last year. */
export function kilometreRace(D) {
  const { cumulative, cy, labels, ytdNow, ytdPrev, ytdDelta } = D.history;
  if (!cumulative.length) return null;
  return {
    years: cumulative.map(({ y }) => ({ key: `y${y}`, label: String(y), current: y === cy })),
    rows: labels.map((d, i) => ({
      label: fmtDayMonth(d),
      month: d.getDate() === 1 ? fmtMonthShort(d) : null,
      ...Object.fromEntries(cumulative.map(({ y, data }) => [`y${y}`, data[i]])),
    })),
    ytd: ytdPrev ? { pct: ytdNow >= ytdPrev ? Math.abs(ytdDelta) : -Math.abs(ytdDelta), text: t('dash.card.ytdPill', { v: nf(Math.abs(ytdDelta)) }),
      tip: t('dash.card.ytdTip', { cy, now: nf(ytdNow), py: cy - 1, prev: nf(ytdPrev) }) } : null,
  };
}

/** The eight records of the period – each with its ride, or empty. */
export function records(D) {
  const rec = D.records, k = (key) => t('dash.records.' + key), elev = t('units.elev');
  return [
    { key: 'distance', label: k('longest'), r: rec.longest, f: (r) => `${nf(r.distance / 1000, 1)} km` },
    { key: 'time', label: k('longestTime'), r: rec.longestTime, f: (r) => fmtDur(r.moving_time) },
    { key: 'elev', label: k('elev'), r: rec.climb, f: (r) => `${nf(r.elev)} ${elev}` },
    { key: 'np', label: k('np'), r: rec.np, f: (r) => `${Math.round(r.np)} W` },
    { key: 'load', label: k('load'), r: rec.load, f: (r) => nf(r.load) + (r.tss != null ? ' TSS' : k('effort')) },
    { key: 'speed', label: k('speed'), r: rec.fastest, f: (r) => `${nf(r.speed * 3.6, 1)} km/h` },
    { key: 'prs', label: k('prs'), r: rec.prs, f: (r) => t('common.prs', { n: r.pr }) },
    { key: 'hr', label: k('hr'), r: rec.maxHr, f: (r) => `${r.hr_max} bpm` },
  ].map(({ r, f, ...x }) => (r ? { ...x, id: r.id, value: f(r), name: r.name, date: fmtDateL(r.d) } : { ...x, id: null, value: '–', name: null, date: t('common.noData') }));
}
