import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../scripts/shared/metrics.ts';
import { createBuildDataset, memorySource } from './build-dataset.ts';
import { encodeDashboard, decodeDashboard } from './dashboard-payload.ts';
import { performancePayload } from './performance-payload.ts';
import { dashboardPeriod } from '../dashboard-period/index.ts';
import { fitnessChartData } from '../components/dashboard/fitness-data.ts';
import { periodCurve } from '../components/dashboard/progress-data.ts';
import { rideAnalysis } from '../components/dashboard/ride-analysis-data.ts';
import { timeInZones } from '../components/dashboard/intensity-data.ts';
import { powerProfile } from '../components/dashboard/overview-data.ts';
import { nutrition } from '../components/dashboard/nutrition-data.ts';
import { longTermFitnessData } from '../components/performance/performance-data.ts';

// An in-memory data source; the real build dataset, build payloads, browser data and card data functions.
const entry = (id, overrides = {}) => ({
  id, sport_type: 'Ride', start_date_local: '2024-05-01T12:00:00Z',
  moving_time: 3600, device_watts: true, average_watts: 200,
  suffer_score: 42, metrics: {}, ...overrides,
});

async function consumers(rides, history = [], now = new Date('2024-05-03T12:00:00')) {
  const data = await createBuildDataset(memorySource({ athlete: { zones: { ftp: 200 }, profile: { weight: 75 } }, history, rides }), { now });
  // The real build payload, so producer and browser consumer share one contract.
  const source = decodeDashboard(encodeDashboard({ rides: data.rides, athlete: data.athlete, athleteState: data.athleteToday }));
  // The React dashboard: same payload, same period (30 days, power), same clock
  const D = dashboardPeriod(source.rides, { days: 30, basis: 'power', now, gear: source.athlete.gear, athleteState: source.athlete.athleteState });
  const { zones: { ftp }, weight: kg } = source.athlete.athleteState;
  const rows = fitnessChartData(D);
  const pmc = { data: { datasets: [
    { label: 'Fitness (CTL)', data: rows.map((r) => r.ctl) },
    { label: 'Fatigue (ATL)', data: rows.map((r) => r.atl) },
  ] } };
  const curve = periodCurve(D, { ftp, kg });
  const analysis = D.rides.length ? rideAnalysis(D, D.rides[0].id, { basis: 'power' }) : null;
  const performance = performancePayload(data);
  // Long-term fitness chart of the React performance page: the rows it draws
  const ltf = longTermFitnessData(performance.ctl);
  const performanceChart = { data: { datasets: [
    { label: 'Fitness (CTL)', data: ltf.map((r) => r.ctl) },
    { label: 'Fatigue (ATL)', data: ltf.map((r) => r.atl) },
  ] } };
  return { pmc, curve, performance, performanceChart, rides: data.rides, analysis,
    exact: timeInZones(D, 'power'), profile: powerProfile(D, { ftp, kg }), food: nutrition(D, kg) };
}

describe('training values on dashboard and performance', () => {
  it('renders ride analysis and ride page values identically for two athlete states, without browser recomputation', async () => {
    const history = [{ date: '2024-01-01', ftp: 200 }, { date: '2024-05-02', ftp: 300 }];
    for (const [date, ifText, tss, zone] of [['2024-05-01', '1.00', 100, 4], ['2024-05-02', '0.67', 44, 2]]) {
      const { rides, analysis, exact } = await consumers([entry('ride', {
        start_date_local: `${date}T12:00:00`, average_heartrate: 100,
        metrics: { np: 200, ftp_used: 250, time_in_power_zones: [600, 3000] },
      })], history);
      // The dataset's rides are exactly the r the ride page payload (ride-payload.ts) uses.
      expect(rides[0]).toMatchObject({ if_: date.endsWith('01') ? 1 : 2 / 3, tss, clsP: { zone }, ef: 2 });
      expect(analysis.chips).toContainEqual({ label: 'IF · TSS', value: `${ifText} · ${tss}` });
      expect(analysis.zoneLabel).toBe(`Z${zone}`);
      expect(analysis.chips).toContainEqual({ label: 'EF', value: '2.000' });
      expect(analysis.tiz.power.label).toContain('Sync FTP 250 W · boundaries not stored');
      expect(exact.note).toContain('boundaries may differ per ride');
    }
  });
  it.each([[4.999, 'Stable – strong aerobic base'], [5, 'Okay – keep building the base'], [10, 'Significant drift']])('renders pure recommendations and the unchanged decoupling boundary %s', async (dec, label) => {
    const output = await consumers([entry('guide', { metrics: { decoupling_pct: dec, power_curve: { 1200: 250 } } })]);
    expect(output.analysis.decoupling.label).toContain(label);
    expect(output.profile.hintHtml).toContain('An FTP test is worth it');
    expect(output.food.macros.map((m) => m.value)).toEqual(expect.arrayContaining(['120–150 g', '60–90 g', '2.6–3.0 l']));
  });

  it('shows historical W/kg in the real dashboard consumer instead of today\'s 75 kg', async () => {
    const { curve, performance } = await consumers([
      entry('old', { start_date_local: '2024-04-01T12:00:00Z', metrics: { power_curve: { 60: 400, 1200: 250 } } }),
      entry('new', { metrics: { power_curve: { 60: 300, 1200: 300 } } }),
    ], [{ date: '2024-01-01', weight: 100 }, { date: '2024-05-01', weight: 75 }]);
    expect(curve.rows.map((r) => r.curveAll)).toEqual([400, 300]);
    expect(curve.rows.map((r) => r.curveAllWkg)).toEqual([4, 4]);
    expect(performance.profile[0].vals[1]).toMatchObject({ id: 'old', wkg: 4, kg: 100 });
  });

  it('shows the same CTL/ATL today despite missing NP, rest days and several rides per day', async () => {
    const { pmc, performance, performanceChart } = await consumers([
      entry('without-np'),
      entry('with-np', { metrics: { np: 200 }, suffer_score: 999 }),
      entry('zero', { moving_time: 0, metrics: { np: 200 }, suffer_score: 999 }),
      entry('ebike', { sport_type: 'EBikeRide', metrics: { np: 1000 } }),
      entry('emtb', { sport_type: 'EMountainBikeRide', metrics: { np: 1000 } }),
    ]);
    const current = performance.ctl.at(-1);
    expect(current.date).toBe('2024-05-03');
    expect(current.ctl).toBeCloseTo(142 / 42 * (41 / 42) ** 2, 12);
    expect(current.atl).toBeCloseTo(142 / 7 * (6 / 7) ** 2, 12);
    for (const label of ['Fitness (CTL)', 'Fatigue (ATL)']) {
      expect(pmc.data.datasets.find((d) => d.label === label).data.at(-1))
        .toBe(performanceChart.data.datasets.find((d) => d.label === label).data.at(-1));
    }
  });

  it('renders dashboard and performance with the same fitness across the local new year', async () => {
    const time = Array.from({ length: 1801 }, (_, i) => i);
    const metrics = computeMetrics({}, { time: { data: time }, watts: { data: time.map(() => 200) } });
    const { pmc, performance, performanceChart } = await consumers([
      entry('done', { start_date: '2023-12-31T10:30:00Z', start_date_local: '2024-01-01T00:30:00+14:00', moving_time: 1800, metrics }),
      entry('future', { start_date: '2023-12-31T11:45:00.001Z', start_date_local: '2024-01-01T01:45:00+14:00', metrics }),
    ], [], new Date('2023-12-31T11:45:00Z'));
    expect(performance.ctl.at(-1)).toMatchObject({ date: '2024-01-01' });
    expect(performance.ctl.at(-1).ctl).toBeCloseTo(50 / 42);
    expect(performance.months.at(-1)).toMatchObject({ key: '2024-01', eftp: 190 });
    expect(performance.current).toMatchObject({ eftp: 190 });
    for (const label of ['Fitness (CTL)', 'Fatigue (ATL)']) {
      expect(pmc.data.datasets.find(d => d.label === label).data.at(-1))
        .toBe(performanceChart.data.datasets.find(d => d.label === label).data.at(-1));
    }
  });

  it('assigns load to the local ride date even when the timestamp gives another day at build time', async () => {
    const { pmc, performance } = await consumers([
      entry('late', { start_date_local: '2024-05-01T23:30:00-10:00', metrics: { np: 200 } }),
    ]);
    expect(performance.ctl.at(-1).date).toBe('2024-05-03');
    expect(performance.ctl.at(-1).ctl).toBeCloseTo(100 / 42 * (41 / 42) ** 2, 12);
    expect(pmc.data.datasets.find((d) => d.label === 'Fitness (CTL)').data.at(-1)).toBe(2.3);
    expect(pmc.data.datasets.find((d) => d.label === 'Fatigue (ATL)').data.at(-1)).toBe(10.5);
  });

  it('keeps handcycle and velomobile from #3 as stat rides', async () => {
    const { pmc, performance, curve } = await consumers([
      entry('handcycle', { sport_type: 'Handcycle', metrics: { np: 200, power_curve: { 5: 700 } } }),
      entry('velomobile', { sport_type: 'Velomobile', metrics: { np: 200, power_curve: { 5: 800 } } }),
    ]);
    expect(performance.ctl.at(-1).ctl).toBeCloseTo(200 / 42 * (41 / 42) ** 2, 12);
    expect(pmc.data.datasets.find((d) => d.label === 'Fitness (CTL)').data.at(-1)).toBe(4.5);
    expect(performance.curves.all[5]).toBe(800);
    expect(performance.profile[0].vals[0]).toMatchObject({ w: 800, id: 'velomobile' });
    expect(curve.rows.map((r) => r.curveAll)).toEqual([800]);
  });

  it('uses only the last 90 days for eFTP and only the month itself for monthly bests', async () => {
    const { performance } = await consumers([
      entry('old', { start_date_local: '2024-01-01T12:00:00Z', metrics: { power_curve: { 1200: 400 } } }),
      entry('recent', { metrics: { power_curve: { 1200: 250, 3600: 240 } } }),
    ]);
    expect(performance.months.find((m) => m.key === '2024-01')).toMatchObject({ eftp: 380, best20: 400 });
    expect(performance.months.find((m) => m.key === '2024-04')).toMatchObject({ eftp: null, best20: null });
    expect(performance.months.at(-1)).toMatchObject({ key: '2024-05', eftp: 240, best20: 250 });
    expect(performance.current).toMatchObject({ eftp: 240 });
  });

  it('uses the same best curve including rides without a power curve and without e-bikes', async () => {
    const { curve, performance } = await consumers([
      entry('a', { metrics: { power_curve: { 5: 900, 1200: 200 } } }),
      entry('b', { metrics: { power_curve: { 5: 800, 1200: 250, 3600: 230 } } }),
      entry('no-curve'),
      entry('ebike', { sport_type: 'EBikeRide', metrics: { np: 1000, power_curve: { 5: 9999, 1200: 9999 } } }),
    ]);
    expect(performance.curves.all).toEqual({ 5: 900, 1200: 250, 3600: 230 });
    expect(performance.profile[0].vals.map((v) => v?.id ?? null)).toEqual(['a', null, null, 'b', 'b']);
    expect(curve.rows.map((r) => r.curveAll)).toEqual([900, 250, 230]);
    expect(performance.months.at(-1)).toMatchObject({ eftp: 238, best20: 250 });
  });
});
