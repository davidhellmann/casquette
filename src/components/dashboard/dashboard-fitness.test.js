import { expect, it } from 'vitest';
import { decodeDashboard, encodeDashboard } from '../../lib/dashboard-payload.js';
import { createBuildDataset, memorySource } from '../../lib/build-dataset.js';
import { performancePayload } from '../../lib/performance-payload.ts';
import { dashboardPeriod } from '../../dashboard-period/index.js';
import { fitnessChartData } from './fitness-data.js';

it('returns exactly the same CTL/ATL today on the dashboard and on /performance, even after rest days', async () => {
  const now = new Date(2024, 8, 15, 12);
  // Load from Relative Effort only, a known 0 TSS beside Relative Effort, a TSS, and a late-evening ride
  const ride = (id, start_date_local, extra) => ({ id, start_date_local, sport_type: 'Ride', moving_time: 3600, ...extra });
  const rides = [
    ride('0', '2024-08-01T23:30:00', { suffer_score: 200 }),
    ride('1', '2024-09-02T08:00:00', { suffer_score: 60, device_watts: true, weighted_average_watts: 10 }),
    ride('2', '2024-09-02T19:00:00', { suffer_score: 90, device_watts: true, weighted_average_watts: 133 }),
    ride('3', '2024-09-10T12:00:00', { suffer_score: 52 }),
  ];
  const data = await createBuildDataset(memorySource({ rides }), { now });
  expect(data.rides.map((r) => r.load)).toEqual([52, 44, 0, 200]);
  // The dashboard payload: the same final rides; load is already computed.
  const D = dashboardPeriod(decodeDashboard(encodeDashboard({ rides: data.rides })).rides, { days: 90, basis: 'power', now });
  const dashboard = D.fitness.at(-1);
  const today = performancePayload(data).ctl.at(-1);
  expect(today.date).toBe('2024-09-15');
  expect(dashboard.day).toBe('2024-09-15');
  expect(today.ctl).toBeGreaterThan(0);
  expect(today.ctl).toBe(dashboard.ctl);
  expect(today.atl).toBe(dashboard.atl);
  expect(dashboard.load).toBe(0);
  expect(fitnessChartData(D).at(-1)).toMatchObject({ day: '2024-09-15', ctl: +today.ctl.toFixed(1), atl: +today.atl.toFixed(1) });
});
