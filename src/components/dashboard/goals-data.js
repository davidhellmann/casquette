/**
 * Goal cards of the dashboard (src/data/goals.json, independent of the period): each goal evaluated
 * with evalGoal (src/scripts/goals.js) and turned into what its card shows. Pure. *Html = i18n markup.
 */
import { DEC, UNIT, evalGoal, fmtP } from '../../scripts/goals.js';
import { nf } from '../../scripts/format.js';
import { t } from '../../i18n/index.js';

export function goalCards(goals, ridesAll, now) {
  return (goals || []).filter((g) => g && g.target > 0).map((g) => {
    const e = evalGoal(g, ridesAll, now), u = UNIT[g.metric] || '', dec = DEC[g.metric] ?? 0;
    const pct = Math.min(100, (e.value / g.target) * 100);
    const daysLeft = Math.max(0, Math.ceil((e.P.end - now) / 86400000));
    return {
      id: g.id ?? g.label,
      eyebrow: [t('goals.period.' + g.period), g.metric === 'zone_time' ? `Z${g.zone || 2} ${t(g.basis === 'hr' ? 'range.hr' : 'range.power')}` : null].filter(Boolean).join(' · '),
      label: g.label,
      note: g.metric === 'zone_time' ? t('zones.legacyNote') : null,
      status: e.done ? { up: true, text: t('goals.reached') }
        : e.ahead >= 0 ? { up: true, text: t('goals.ahead', { v: nf(e.ahead, dec), u }) }
        : { up: false, text: t('goals.behind', { v: nf(e.ahead, dec), u }) },
      value: nf(e.value, dec), target: `/ ${nf(g.target, dec)} ${u}`.trim(),
      pct, pace: Math.min(100, e.frac * 100),
      pctTipHtml: t('goals.pctTip', { pct: nf(pct, 0), v: nf(e.expected, dec), u }),
      meta: [
        e.done ? t('goals.done') : t('goals.left', { v: nf(Math.max(0, g.target - e.value), dec), u, days: t('common.days', { n: daysLeft }) }),
        e.projection != null && g.period !== 'week' ? t('goals.projection', { v: nf(e.projection, dec), u }) : null,
      ].filter(Boolean),
      history: [
        ...e.hist.map((h) => ({ hit: h.hit, tip: `${fmtP(g, h.start)}: ${nf(h.v, dec)} ${u}`.trim() })),
        { hit: e.done, current: true, tip: t('goals.running', { p: fmtP(g, e.P.start), v: nf(e.value, dec), u }).trim() },
      ],
      streak: e.streak > 1 ? t('goals.streak', { n: e.streak }) : null,
    };
  });
}
