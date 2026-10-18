import { describe, expect, it } from 'vitest';
import { dashboardPeriod } from './index.js';
import { fixtures, now, ride } from './fixtures.js';
import legacy from './legacy-results.json';
import legacyCards from './legacy-cards.json';
const calculate = (rides = fixtures(), options = {}) => dashboardPeriod(rides, { days: 14, basis: 'power', now, ...options });
// Goldens carry the capturing machine's Date serialization; calendar day is the contract.
const withoutDateSerialization = value => JSON.parse(JSON.stringify(value, (key,v) => key === 'd' ? undefined : v));

describe('Dashboard period: public interface', () => {
  for (const days of [14, 30, 90, 365, 0]) for (const basis of ['power', 'hr']) it(`preserves original KPIs/previous period/halves/80-20/power curves/fitness: ${days}/${basis}`, () => {
    const result = calculate(fixtures(), { days, basis });
    const expected = legacy[`${days}-${basis}`];
    for (const [key, value] of Object.entries(expected.S)) {
      expect(key === 'efList' ? result.S[key].map(r => r.id) : result.S[key], key).toEqual(value);
    }
    expect(result.rides.map(r => r.id)).toEqual(expected.rides);
    expect(result.prevRides.map(r => r.id)).toEqual(expected.prev);
    if (days === 14) {
      expect(result.nutrition).toEqual(legacyCards[basis].nutrition);
      expect(withoutDateSerialization(result.load)).toMatchObject(withoutDateSerialization(legacyCards[basis].load));
    }
    expect(result.pmc).toHaveLength(expected.pmc.n);
    expect(withoutDateSerialization(result.pmc.at(-1))).toEqual(withoutDateSerialization(expected.pmc.last));
  });
  it('returns finished records, fueling, rhythm, EF smoothing and historical power curve W/kg', () => {
    const D = calculate();
    expect(D.records.longest.id).toBe('recent');
    expect(D.records.np.id).toBe('recent');
    expect(D.nutrition).toEqual(legacyCards.power.nutrition);
    expect(withoutDateSerialization(D.load)).toMatchObject(withoutDateSerialization(legacyCards.power.load));
    expect(D.rhythm.hours.reduce((a,b) => a+b, 0)).toBe(4);
    expect(D.rhythm.weekdays.reduce((a,b) => a+b, 0)).toBe(5);
    expect(D.weekly.buckets.reduce((s,b) => s + b.total, 0)).toBe(5);
    expect(D.curves.wkg.curveAll[1200]).toBe(240 / 75);
    expect(D.S.efRolling).toEqual([1.429, 0.715, 0.953]);
    expect(D.sparks.n.reduce((a,b) => a+b, 0)).toBe(D.S.n);
    expect(D.load.last7).toBe(89);
  });
  it('aggregates history and heatmap from stat rides only, independent of the period', () => {
    const D = calculate();
    expect(D.history.years.map(y => [y.y, y.n, y.km])).toEqual([[2023, 3, 90], [2024, 4, 120]]);
    expect(D.history).toMatchObject({ km: 210, h: 8, elev: 2800, ytdNow: 120, ytdPrev: 30, multiYear: true });
    expect(D.history.cumulative[0].data[13]).toBe(120);
    expect(D.history.cumulative[0].data[14]).toBeNull();
    expect(D.heatmap).toMatchObject({ activeDays: 6, longest: 2, current: 1, weeks: 4, hoursPerWeek: 7 / 52 });
    expect(D.heatmap.day['2023-12-19']).toBeUndefined();
    expect(D.heatmap.cells).toHaveLength(371);
  });
  it('sums historical and legacy TIZ without reporting unknown boundaries as exact', () => {
    const distribution = { version: 1, method: 'right-sample-dt-0-10s', samples: [[200, 3600]] };
    const a = ride('old', '2023-12-31', { metrics: { power_distribution: distribution } });
    const b = ride('new', '2024-01-01', { metrics: { power_distribution: distribution } });
    const D = calculate([a,b,ride('legacy','2024-01-02')], { days: 30 });
    expect(D.tiz.power).toMatchObject({ total: 10800, z2Percent: 50, exact: false, mixed: true, zones: null, legacyCount: 1 });
    expect(D.tiz.power.bases.map(b => b.ftp)).toEqual([250,300,200]);
    expect(D.rideTiz.old.power).toBe(3600);
    const exact = calculate([a,b], { days: 30 }).tiz.power;
    expect(exact).toMatchObject({ exact: true, mixed: true, zones: null, legacyCount: 0 });
    expect(calculate([a], { days: 30 }).tiz.power.zones).toEqual(a.tizBasis.power.zones);
  });
  it('keeps e-bike rides before the first stat ride in the all-time ride log', () => {
    const rides = [ride('electric', '2020-01-01', { sport_type: 'EBikeRide' }), ride('muscle','2024-01-14')];
    const D = calculate(rides, { days: 0 });
    expect(D.log.map(r=>r.id)).toEqual(['muscle','electric']);
    expect(D.days).toBe(1);
    expect(D.S.n).toBe(1);
    expect(D.prevRides).toEqual([]);
    expect(D.S.deltas.n).toBeNull();
    expect(D.heatmap.activeDays).toBe(1);
    const only = calculate([rides[0]], { days: 0 });
    expect(only.log).toHaveLength(1);
    expect(only.days).toBe(1);
    expect(only.ridesAll).toEqual([]);
  });
  it('returns defined null/0 values for empty and all time without an invented previous period', () => {
    for (const days of [14, 0]) {
      const D = calculate([], { days });
      expect(D.S).toMatchObject({ n: 0, time: 0, tss: 0, avgW: null, avgHR: null, low: 0, ctl: 0, atl: 0, tsb: 0 });
      expect(D.S.deltas).toEqual({ n:null,time:null,dist:null,elev:null,tss:null,pr:null,power:null,hr:null });
      expect(D.curves.seconds).toEqual([]);
      expect(D.nutrition).toMatchObject({ fuel:0,fluid:0,dailyHours:0 });
      expect(D.tiz.power).toMatchObject({ total:0,z2Percent:0,exact:false,zones:null });
      expect(D.records.longest).toBeNull();
      expect(D.heatmap.activeDays).toBe(0);
    }
    const D = calculate([ride('past','2023-01-01')]);
    expect(D.S.n).toBe(0);
    expect(D.pmc).toHaveLength(14);
    expect(D.load).toMatchObject({ last7:0,rest14:14,streak:0 });
  });
  it('excludes the future, including later on the same day, and keeps date boundaries exact', () => {
    const at = (id, start) => ride(id, start.slice(0,10), { start_date_local:start });
    const rides = [at('start','2024-01-01T00:00:00'), at('prevEnd','2023-12-31T23:59:59'),
      at('prevStart','2023-12-18T00:00:00'), at('tooOld','2023-12-17T23:59:59'),
      at('now','2024-01-14T18:00:00'), at('later','2024-01-14T18:00:01'), at('tomorrow','2024-01-15T00:00:00')];
    const D = calculate(rides);
    expect(D.rides.map(r=>r.id)).toEqual(['now','start']);
    expect(D.prevRides.map(r=>r.id)).toEqual(['prevEnd','prevStart']);
    expect(D.log.map(r=>r.id)).toEqual(['now','start']);
    expect(D.ridesAll).toHaveLength(5);
    expect(D.heatmap.day['2024-01-14'].n).toBe(1);
    expect(D.heatmap.day['2024-01-15']).toBeUndefined();
    expect(D.history.years.at(-1).n).toBe(2);
  });
  for (const [start, end] of [['2024-03-25','2024-04-07'], ['2024-10-21','2024-11-03']]) it(`counts calendar days across DST: ${start}`, () => {
    const rides = [ride('start',start),ride('end',end)], clock = new Date(end+'T18:00:00');
    const D = calculate(rides, { days:0, now:clock });
    expect(D.days).toBe(14);
    expect(D.rangeStart.getDate()).toBe(new Date(start+'T00:00:00').getDate());
    expect(D.S.hoursPerWeek).toBe(1);
    expect(D.history.cumulative[0].data.filter(v=>v !== null)).toHaveLength(end === '2024-04-07' ? 98 : 308);
    expect(D.history.cumulative[0].data[end === '2024-04-07' ? 84 : 294]).toBe(30);
    expect(D.pmc).toHaveLength(14);
  });
  it('keeps the leap day and day 366 in the cumulative year', () => {
    const D = calculate([ride('feb28','2024-02-28'),ride('feb29','2024-02-29'),ride('mar01','2024-03-01')], { days:0, now:new Date('2024-03-01T18:00:00') });
    expect(D.days).toBe(3);
    expect(D.history.cumulative[0].data.slice(58,62)).toEqual([30,60,90,null]);
    expect(D.pmc.map(p=>p.day)).toEqual(['2024-02-28','2024-02-29','2024-03-01']);
    const yearEnd = calculate([ride('last','2024-12-31')], { days:0, now:new Date('2024-12-31T18:00:00') });
    expect(yearEnd.history.cumulative[0].data[365]).toBe(30);
  });
  it('compares the year to date with the previous year up to the same date, also across leap years', () => {
    const lastYear = [ride('feb28','2024-02-28'), ride('feb29','2024-02-29'), ride('mar01','2024-03-01'), ride('mar02','2024-03-02')];
    // 1 March is day 60 of a common year but day 61 of a leap year: the same date counts, not the same day number.
    const march = calculate([...lastYear, ride('now','2025-03-01')], { days:0, now:new Date('2025-03-01T18:00:00') });
    expect(march.history).toMatchObject({ ytdNow: 30, ytdPrev: 90 });
    expect(march.history.cumulative[0].data.slice(58,62)).toEqual([0,0,30,null]);
    expect(march.history.cumulative[1].data.slice(58,62)).toEqual([30,60,90,120]);
    const feb28 = calculate([...lastYear, ride('now','2025-02-28')], { days:0, now:new Date('2025-02-28T18:00:00') });
    expect(feb28.history.ytdPrev).toBe(30);
    // 29 February compares with 28 February of the common year before.
    const leapDay = calculate([ride('feb28','2023-02-28'), ride('mar01','2023-03-01'), ride('now','2024-02-29')], { days:0, now:new Date('2024-02-29T18:00:00') });
    expect(leapDay.history).toMatchObject({ ytdNow: 30, ytdPrev: 30 });
  });
  it('treats 0 as known, null as unknown and uses finished rather than today\'s metrics', () => {
    const a = ride('zero','2024-01-14', { average_watts:0, metrics:{np:0}, suffer_score:999 });
    const b = ride('unknown','2024-01-13', { device_watts:false,has_heartrate:false,metrics:{} });
    const D = calculate([a,b]);
    expect(D.S).toMatchObject({ avgW:0,avgWkg:0,tss:0,ztot:3600,zu:3600 });
    expect(D.load.last7).toBe(0);
    expect(D.S.efList.map(r=>r.id)).toEqual(['zero']);
    expect(D.S.efRolling).toEqual([0]);
    expect(D.curves.wkg.curve).toEqual({});
    const c = { ...ride('noWeight','2024-01-14'), kg:null };
    expect(calculate([c]).curves.wkg.curve[1200]).toBeNull();
    const historical = calculate([ride('old','2023-12-31'),ride('new','2024-01-01')], { days:30 });
    expect(historical.S.tss).toBe(144);
    expect(historical.S.zt).toEqual([0,0,3600,0,3600,0,0,0]);
  });
  it('keeps the weekly tooltip as the sum of bars rounded to two decimals', () => {
    const D = calculate([ride('low','2024-01-10',{moving_time:3700}),ride('high','2024-01-11',{moving_time:3700,average_watts:400})]);
    const b = D.weekly.buckets.find(b=>b.total>0);
    expect(b.tooltipTotal).toBe(2.06);
    expect(b.total).toBe(7400/3600);
  });
  it('preserves the explicit clock for consumers such as goal projections', () => {
    const D = calculate();
    expect(D.now).toEqual(now);
    expect(D.now).not.toBe(now);
  });
  it('preserves the original summation order of the all-time distance before km conversion', () => {
    const rides = Array.from({length:7}, (_,i) => ride(String(i),'2024-01-01',{distance:100.1}));
    expect(calculate(rides).history.km).toBe(rides.reduce((s,r)=>s+r.distance,0)/1000);
  });
  it('returns garage totals and ordering instead of browser aggregation', () => {
    const gear = [{ id:'b',type:'bike',distance:2000 }, { id:'a',type:'bike',distance:5000 },
      { id:'old',type:'bike',retired:true,distance:10000 }, { type:'shoes',distance:99999 }];
    const D = calculate([ride('1','2024-01-01',{gear_id:'a',distance:3000}),
      ride('2','2024-01-01',{gear_id:'b',distance:4000}), ride('3','2024-01-01',{gear_id:'old',distance:1000})], { gear });
    expect(D.garage.active.map(g=>g.id)).toEqual(['b','a']);
    expect(D.garage.retired).toHaveLength(1);
    expect(D.garage).toMatchObject({ total:8000,max:4000 });
  });
  it.each([[.9, 'none'], [.899, 'under'], [1.03, 'none'], [1.031, 'test']])('returns the FTP recommendation at boundary %s without DOM', (ratio, expected) => {
    // 20-min * .95 gives exactly 900, 899, 1030 or 1031 W after rounding.
    const D = calculate([ride('x', '2024-01-14', { metrics: { power_curve: { 1200: 1000 * ratio / .95 } } })], { athleteState: { ftp: 1000, weight: 80 } });
    expect(D.ftpRecommendation).toBe(expected);
  });
  it.each([[null, 'unknown'], [-1, 'stable'], [4.999, 'stable'], [5, 'moderate'], [9.999, 'moderate'], [10, 'drift']])('returns the decoupling status for %s without DOM', (dec, expected) => {
    expect(calculate([ride('x','2024-01-14',{ metrics: { decoupling_pct: dec } })]).decoupling.x).toBe(expected);
  });
  it.each([[.749, 'light', [4,5]], [.75, 'moderate', [5,7]], [1.499, 'moderate', [5,7]], [1.5, 'high', [7,10]]])('returns unchanged daily needs at %s h/day', (hours, category, carbs) => {
    const D = calculate([ride('x','2024-01-14',{ moving_time: hours * 14 * 3600 })], { athleteState: { ftp: 200, weight: 80 } });
    expect(D.dailyNeeds).toEqual({ category, perKg: { carbs, protein: [1.6,2], fat: [.8,1.2], water: [.035,.04] },
      amounts: { carbs: carbs.map(x => x * 80), protein: [128,160], fat: [64,96], water: [80 * .035,3.2] } });
    expect(D.nutrition).toMatchObject({ category, carbsPerKg: carbs });
    expect(calculate([], { athleteState: { ftp: 200 } }).dailyNeeds).toMatchObject({ category: 'light', amounts: null });
    expect(calculate([], { athleteState: { ftp: 200, weight: 80 } }).ftpRecommendation).toBe('none');
  });

  it('is repeatable, reentrant and mutates neither inputs nor clock', () => {
    const rides = fixtures(), before = JSON.stringify(rides), clock = +now;
    const a = calculate(rides);
    calculate(rides, { basis:'hr', days:0 });
    expect(calculate(rides)).toEqual(a);
    expect(JSON.stringify(rides)).toBe(before);
    expect(+now).toBe(clock);
    expect(() => calculate(rides,{now:undefined})).toThrow('now');
    expect(() => calculate(rides,{days:15})).toThrow('range');
  });
});
