import { afterEach, expect, it, vi } from 'vitest';
import { computeDashboard, dashboardSource } from './dashboard-data.js';
import { fitnessChartData } from './fitness-data.js';
import { performanceData } from '../../lib/performance.js';
import { loadStatRides } from '../../lib/data.js';

vi.mock('../../lib/data.js', () => ({
  loadStatRides: vi.fn(), loadHistory: () => [], ftpAt: () => 200, weightAt: () => 75,
}));
afterEach(() => vi.useRealTimers());

it('returns exactly the same CTL/ATL today on the dashboard and on /performance, even after rest days', async () => {
  const now = new Date(2024, 8, 15, 12);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const rides = [
    { start_local: '2024-08-01T23:30:00', tss: 83.75, re: 200, load: 83.75 },
    { start_local: '2024-09-02T08:00:00', tss: 0, re: 60, load: 0 },
    { start_local: '2024-09-02T19:00:00', tss: 44.3, re: 90, load: 44.3 },
    { start_local: '2024-09-10T12:00:00', tss: null, re: 52, load: 52 },
  ].map((r, i) => ({ ...r, id: String(i), stats: true, d: new Date(r.start_local), year: 2024 }));
  loadStatRides.mockResolvedValue(rides);
  // The dashboard payload: the same flat rides, newest first; load is already computed.
  const payload = rides.slice().reverse().map(({ d, year, ...r }) => r);
  const D = computeDashboard(dashboardSource({ rides: payload }), { days: 90, basis: 'power', now });
  const dashboard = D.fitness.at(-1);
  const performance = await performanceData();
  const today = performance.ctl.at(-1);
  expect(today.date).toBe('2024-09-15');
  expect(dashboard.day).toBe('2024-09-15');
  expect(today.ctl).toBeGreaterThan(0);
  expect(today.ctl).toBe(dashboard.ctl);
  expect(today.atl).toBe(dashboard.atl);
  expect(dashboard.load).toBe(0);
  expect(fitnessChartData(D).at(-1)).toMatchObject({ day: '2024-09-15', ctl: +today.ctl.toFixed(1), atl: +today.atl.toFixed(1) });
});
