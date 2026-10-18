import { addDays, calendarDay, dailyNeeds, decouplingStatus, ftpRecommendation, fuel, fuelCell, records, weekStart } from '../training/index.js';

const percent = (current, previous) => current == null || !previous ? null : (current - previous) / previous * 100;

export function cards(D, basis, gear, athleteState) {
  const { rides: R, S, days } = D, cls = r => basis === 'hr' ? r.clsH : r.clsP;
  D.records = records(R);
  const dailyHours = S.time / 3600 / days;
  D.fueling = Object.fromEntries(D.log.map(r => [r.id, { ...fuel(r.moving_time, cls(r).zone), cell: fuelCell(r.moving_time, cls(r).zone) }]));
  D.dailyNeeds = dailyNeeds(dailyHours, athleteState?.weight);
  D.nutrition = { dailyHours, category: D.dailyNeeds.category, carbsPerKg: D.dailyNeeds.perKg.carbs,
    fuel: R.reduce((s,r) => s + D.fueling[r.id].total, 0), fluid: R.reduce((s,r) => s + r.h * .65, 0) };
  D.decoupling = Object.fromEntries(D.log.map(r => [r.id, decouplingStatus(r.dec)]));
  D.rhythm = { weekdays: Array(7).fill(0), hours: Array(24).fill(0), indoor: 0, outdoor: 0 };
  D.gearKm = {};
  for (const r of R) {
    D.rhythm.weekdays[(r.d.getDay() + 6) % 7] += r.h; D.rhythm.hours[r.d.getHours()]++;
    D.rhythm[r.indoor ? 'indoor' : 'outdoor'] += r.h;
    if (r.gear_id) D.gearKm[r.gear_id] = (D.gearKm[r.gear_id] || 0) + (r.distance || 0) / 1000;
  }
  D.rhythm.total = D.rhythm.indoor + D.rhythm.outdoor;
  const monthly = days > 400, buckets = [], idx = {};
  const key = d => monthly ? calendarDay(d).slice(0, 7) : calendarDay(weekStart(d));
  const calendarEnd = D.calendarEnd;
  for (let d = monthly ? new Date(D.periodStart.getFullYear(), D.periodStart.getMonth(), 1) : weekStart(D.periodStart);
    d <= calendarEnd; d = monthly ? new Date(d.getFullYear(), d.getMonth()+1, 1) : addDays(d, 7)) {
    idx[key(d)] = buckets.length; buckets.push({ d, z: Array(6).fill(0), u: 0, total: 0 });
  }
  for (const r of R) {
    const b = buckets[idx[key(r.d)]], z = cls(r).zone;
    if (z) b.z[Math.min(z, 5)] += r.h; else b.u += r.h;
    b.total += r.h;
  }
  // Tooltip sums displayed bars, preserving the original per-series rounding.
  for (const b of buckets) b.tooltipTotal = [...b.z.slice(1), b.u].reduce((s,v) => s + +v.toFixed(2), 0);
  D.weekly = { monthly, buckets };
  S.efRolling = S.efList.map((_, i, list) => { const a = list.slice(Math.max(0, i - 4), i + 1); return +(a.reduce((s,r) => s + r.ef, 0) / a.length).toFixed(3); });
  const byId = new Map(D.ridesAll.map(r => [r.id, r]));
  D.curves = { seconds: [...new Set(['curve','curve1','curve2','curveAll'].flatMap(k => Object.keys(S[k]).map(Number)))].filter(s => s >= 5).sort((a,b) => a-b), wkg: {} };
  for (const k of ['curve','curve1','curve2','curveAll']) D.curves.wkg[k] = Object.fromEntries(Object.entries(S[k]).map(([s,p]) => {
    const kg = byId.get(p.id)?.kg; return [s, kg > 0 ? p.w / kg : null];
  }));
  S.estimatedFtp = S.curve[1200]?.w ? Math.round(S.curve[1200].w * .95) : null;
  D.ftpRecommendation = ftpRecommendation(S.estimatedFtp, athleteState?.ftp);
  S.form = S.tsb > 25 ? 'transition' : S.tsb > 5 ? 'fresh' : S.tsb > -10 ? 'neutral' : S.tsb > -30 ? 'optimal' : 'risk';
  S.polarization = !S.ztot ? 'empty' : S.low >= 75 && S.pZ4 >= 5 ? 'balanced' : S.low < 75 ? 'middle' : 'easy';
  S.deltas = Object.fromEntries(['n','time','dist','elev','tss','pr'].map(k => [k, D.hasPrevious ? percent(S[k], S[k+'P']) : null]));
  S.deltas.power = percent(S.avgW2, S.avgW1); S.deltas.hr = percent(S.avgHR2, S.avgHR1);
  S.hoursPerWeek = S.time / 3600 / (days / 7); S.tssPerWeek = S.tss / (days / 7); S.kmPerRide = S.n ? S.dist / 1000 / S.n : 0;
  D.sparks = {};
  const spark = (f, avg = false) => {
    const n = 12, start = +D.periodStart, width = (+addDays(D.calendarEnd, 1) - start) / n, v = Array(n).fill(0), wt = Array(n).fill(0);
    for (const r of R) { const x = f(r); if (x == null) continue; const i = Math.min(n-1, Math.max(0, Math.floor((+r.d - start) / width)));
      if (avg) { v[i] += x * r.moving_time; wt[i] += r.moving_time; } else v[i] += +x || 0;
    }
    return avg ? v.map((x,i) => wt[i] ? x / wt[i] : null) : v;
  };
  for (const [k, f, avg] of [['n',()=>1], ['time',r=>r.h], ['dist',r=>r.distance/1000], ['elev',r=>r.elev], ['power',r=>r.w,true], ['hr',r=>r.hr,true], ['tss',r=>r.tss], ['pr',r=>r.pr]]) D.sparks[k] = spark(f,avg);
  const F = D.fitness.map(x => ({ ...x, L: x.load })), n = F.length, cur = F.at(-1) || { ctl: 0, atl: 0 }, at = k => F[Math.max(0, n-1-k)] || cur;
  const ramp = cur.ctl - at(7).ctl, acwr = cur.ctl > 1 ? cur.atl / cur.ctl : null, tsb = at(1).ctl - at(1).atl;
  let streak = 0; for (let i = n-1; i >= 0 && F[i].L > 0; i--) streak++;
  D.load = { cur, ramp, ctl6: cur.ctl - at(42).ctl, last7: F.slice(-7).reduce((s,x)=>s+x.L,0),
    avg7: F.slice(-49,-7).reduce((s,x)=>s+x.L,0)/6, acwr, rest14: F.slice(-14).filter(x=>!x.L).length, streak, tsb,
    last28: F.slice(-28), mx: Math.max(1,...F.slice(-28).map(x=>x.L)),
    rampStatus: ramp > 8 ? 'steep' : ramp > 5 ? 'fast' : ramp >= 1 ? 'sustainable' : ramp > -2 ? 'stable' : 'decline',
    acwrStatus: acwr == null ? 'unknown' : acwr > 1.5 ? 'risk' : acwr > 1.3 ? 'high' : acwr >= .8 ? 'sweet' : 'low',
    verdict: tsb < -30 ? 'fatigue' : ramp > 8 ? 'steep' : ramp < -2 ? 'decline' : acwr != null && acwr < .8 ? 'low' : 'balanced' };
  const statsDistance = {};
  for (const r of D.ridesAll) if (r.gear_id) statsDistance[r.gear_id] = (statsDistance[r.gear_id] || 0) + (r.distance || 0);
  const bikes = gear.filter(g=>g.type === 'bike').map(g => ({ ...g, statsDistance: statsDistance[g.id] || 0 }));
  const active = bikes.filter(b=>!b.retired).sort((a,b)=>b.statsDistance-a.statsDistance);
  D.garage = { active, retired: bikes.filter(b=>b.retired), total:bikes.reduce((s,b)=>s+b.statsDistance,0), max:Math.max(1,...active.map(b=>b.statsDistance)) };
}
