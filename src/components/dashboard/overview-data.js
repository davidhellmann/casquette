/**
 * Form today, 80/20 check, power profile and training load of the dashboard: D (src/dashboard-period/)
 * turned into the values, labels and hints the cards show. Pure. Strings marked *Html are i18n
 * strings with simple markup (<b>, <br>).
 */
import { nf, fmtWeekdayDate } from '../../scripts/format.js';
import { t } from '../../i18n/index.js';

/** Colour token per form status. */
const FORM_TONE = { transition: 'warning', fresh: 'brand', neutral: 'muted-foreground', optimal: 'positive', risk: 'negative' };

/** Gauge scale of form (TSB): coloured ranges from overload to transition. */
export const FORM_SCALE = { min: -40, max: 30, ticks: [-30, -10, 5, 25],
  ranges: [[-40, -30, 'negative'], [-30, -10, 'positive'], [-10, 5, 'muted-foreground'], [5, 25, 'brand'], [25, 30, 'warning']] };

export function formToday(D) {
  const S = D.S, f = (key) => t('dash.form.' + key), st = f('status.' + S.form);
  return {
    tsb: S.tsb, value: nf(S.tsb, 0), label: st.l, description: st.d, tone: FORM_TONE[S.form],
    figures: [
      { key: 'fitness', label: f('fitness'), value: nf(S.ctl, 0), delta: `${S.ctlDelta >= 0 ? '+' : ''}${nf(S.ctlDelta, 1)}`, up: S.ctlDelta >= 0, tipHtml: f('fitnessTip') },
      { key: 'fatigue', label: f('fatigue'), value: nf(S.atl, 0), tipHtml: f('fatigueTip') },
      { key: 'form', label: f('form'), value: nf(S.tsb, 0), tipHtml: f('formTip') },
    ],
  };
}

/** 80/20 check: share of easy riding time, zone split and a coaching hint. */
export function polarization(D, zones) {
  const S = D.S, p = (key, x) => t('dash.pol.' + key, x);
  const empty = S.polarization === 'empty';
  const hintHtml = empty ? p('empty')
    : S.polarization === 'balanced' ? p('balanced', { low: nf(S.low), hard: nf(S.pZ4) })
    : S.polarization === 'middle' ? p('middle', { z3: nf(S.pZ3), max: zones.power_zones[1].max })
    : p('easyHeavy');
  return {
    empty, share: S.low / 100, target: 0.8, low: nf(S.low), easy: p('easy'),
    figures: [[p('zone2'), `${nf(S.pZ2)} %`], [p('z2Week'), `${nf(S.z2hWeek, 1)} h`], [p('intense'), `${nf(S.pZ4)} %`]],
    segments: [[1, S.pZ1, 'Z1'], [2, S.pZ2, 'Z2'], [3, S.pZ3, 'Z3'], [4, S.pZ4, 'Z4+']]
      .map(([zone, value, label]) => ({ zone, value, label, text: `${label} ${nf(value)} %`, tip: `${label} · ${nf(value, 1)} %` })),
    hintHtml,
  };
}

/** Power profile: W/kg at FTP and the period's best 5 s / 1 / 5 / 20 min against a top value. */
export function powerProfile(D, { ftp, kg }) {
  const S = D.S, c = S.curve, est = S.estimatedFtp, p = (key, x) => t('dash.profile.' + key, x);
  const labels = p('rows');
  const rows = [[5, 24], [60, 11], [300, 7.5], [1200, 6.5]].map(([s, top], i) => {
    const w = c[s] && c[s].w, wkg = D.curves.wkg.curve[s];
    return { s, label: labels[i][0], name: labels[i][1], watts: w ? `${w} W` : '–', wkg: wkg ? nf(wkg, 1) : '',
      share: wkg ? Math.min(100, (wkg / top) * 100) : 0, tip: w ? `${w} W · ${nf(wkg, 2)} W/kg` : t('common.noData') };
  });
  return {
    wkgFtp: nf(ftp / kg, 2), atFtp: p('atFtp'), ftpHtml: `FTP <b>${ftp} W</b>${est ? p('estimate', { v: est }) : ''}`,
    empty: !rows.some((r) => r.watts !== '–'), rows,
    hintHtml: D.ftpRecommendation === 'test' ? p('testWorth', { v: est }) : D.ftpRecommendation === 'under' ? p('noFullEffort') : null,
  };
}

/** Training load from all rides (independent of the period): last 28 days, ramp, ACWR and a verdict. */
export function trainingLoad(D) {
  const { cur, ramp, ctl6, last7, avg7, acwr, rest14, streak, tsb, last28, rampStatus, acwrStatus } = D.load, l = (key, x) => t('dash.load.' + key, x);
  const sign = (v) => `${v >= 0 ? '+' : ''}${nf(v, 1)}`;
  const RAMP = { steep: 'negative', fast: 'warning', sustainable: 'positive', stable: 'muted-foreground', decline: 'negative' };
  const ACWR = { risk: 'negative', high: 'warning', sweet: 'positive', low: 'muted-foreground' };
  return {
    days: last28.map((x) => ({ day: x.day, load: x.L,
      tipHtml: l('dayTip', { d: fmtWeekdayDate(x.d, false), v: nf(x.L) }) })),
    barsTip: l('barsTip'), from: l('ago4w'), to: l('today'),
    rows: [
      { key: 'ctl', label: l('ctl'), value: nf(cur.ctl), sub: l('ctl6', { v: sign(ctl6) }), tip: l('ctlTip') },
      { key: 'ramp', label: l('ramp'), value: l('rampVal', { v: sign(ramp) }), status: { tone: RAMP[rampStatus], text: l('rampStatus.' + rampStatus) }, tip: l('rampTip') },
      { key: 'acwr', label: l('acwrLabel'), value: acwr == null ? '–' : nf(acwr, 2),
        status: acwrStatus === 'unknown' ? { tone: 'muted-foreground', text: '–' } : { tone: ACWR[acwrStatus], text: l('acwrStatus.' + acwrStatus) }, tip: l('acwrTip') },
      { key: 'last7', label: l('last7'), value: nf(last7), sub: `Ø ${nf(avg7)}`, tip: l('last7Tip') },
      { key: 'tsb', label: l('tsb'), value: nf(tsb), tip: l('tsbTip') },
      { key: 'rest14', label: l('rest14'), value: String(rest14), sub: streak > 1 ? `· ${l('streak', { n: streak })}` : null },
    ],
    verdict: l('verdict.' + D.load.verdict),
  };
}
