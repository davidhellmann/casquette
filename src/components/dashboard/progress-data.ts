// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Progress cards of the dashboard period: aerobic efficiency per ride with its rolling trend and the
 * power curve (period, all-time, 2nd half, FTP) with W/kg at each best's own body weight. Pure;
 * `null` = the card shows its empty state.
 */
import { curveLabel, fmtDate, fmtDateL, nf, trunc } from '../../scripts/format.ts';
import { t } from '../../i18n/index.ts';

/** EF (NP per heartbeat) of each ride, coloured by its zone, plus the rolling 5-ride average. */
export function efficiency(D, basis) {
  const L = D.S.efList;
  if (L.length < 2) return null;
  const trend = D.S.efTrend;
  return {
    trend: trend == null ? null : { pct: trend, tip: t('dash.card.efTip') },
    rows: L.map((r, i) => ({
      id: r.id, label: fmtDate(r.d), name: trunc(r.name, 40), date: fmtDateL(r.d),
      ef: +r.ef.toFixed(3), trend: D.S.efRolling[i],
      zone: Math.min((basis === 'hr' ? r.clsH : r.clsP).zone || 1, 7),
    })),
  };
}

/** Best power per duration (≥ 5 s): period, all-time, 2nd half of the period and today's FTP. */
export function periodCurve(D, { ftp, kg }) {
  const S = D.S, W = D.curves.wkg, secs = D.curves.seconds;
  if (!secs.length) return null;
  const w = (curve, s) => (curve[s] ? curve[s].w : null);
  return {
    // "All time" selected: the period curve is the all-time curve, no comparison is drawn
    compare: D.hasPrevious,
    rows: secs.map((s) => ({
      s, label: curveLabel(s),
      curve: w(S.curve, s), curveWkg: W.curve[s] ?? null,
      curveAll: w(S.curveAll, s), curveAllWkg: W.curveAll[s] ?? null,
      curve2: w(S.curve2, s), curve2Wkg: W.curve2[s] ?? null,
      ftp, ftpWkg: ftp / kg,
    })),
  };
}

/** One value of the curve tooltip: watts and W/kg. */
export const curveValue = (w, wkg) => (w == null ? '–' : `${w} W · ${nf(wkg, 2)} W/kg`);
