// Fixed, synthetic final rides shared by regression tests; no repository ride data.
import { processRide } from '../ride/index.js';
import { athleteTimeline } from '../training/index.js';
export const now = new Date('2024-01-14T18:00:00');
export const timeline = athleteTimeline({ history: [
  { date: '2023-01-01', ftp: 200, weight: 100 },
  { date: '2024-01-01', ftp: 300, weight: 75 },
] });
export const athleteState = timeline.at('2024-01-14');
export function ride(id, date, extra = {}) {
  const data = { id, name: id, start_date_local: date + 'T12:00:00', sport_type: 'Ride',
    moving_time: 3600, distance: 30000, total_elevation_gain: 400, calories: 500,
    device_watts: true, average_watts: 200, average_heartrate: 140, max_heartrate: 170,
    average_speed: 8, pr_count: 2, gear_id: 'bike',
    metrics: { np: 200, power_curve: { 5: 600, 60: 400, 1200: 240 },
      time_in_power_zones: [0, 1800, 1800], time_in_hr_zones: [0, 3000, 600], ftp_used: 250 }, ...extra };
  return processRide(data, timeline.at(data.start_date_local));
}
export const fixtures = () => [
  ride('recent', '2024-01-14', { moving_time: 7200 }),
  ride('zero', '2024-01-10', { average_watts: 0, metrics: { np: 0 }, suffer_score: 99 }),
  ride('first', '2024-01-03'),
  ride('missing', '2024-01-01', { device_watts: false, has_heartrate: false, metrics: {} }),
  ride('previous', '2023-12-31'),
  ride('older', '2023-12-20', { sport_type: 'VirtualRide' }),
  ride('ebike', '2023-12-19', { sport_type: 'EBikeRide' }),
  ride('oldest', '2023-01-01'),
];
