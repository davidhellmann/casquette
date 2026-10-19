/**
 * A small demo-like build dataset for the payload tests: synthetic rides, gear, history and streams of a
 * fictional rider (no personal data), served by the in-memory data source.
 */
import { createBuildDataset, memorySource } from './build-dataset.ts';
import type { BuildDataset, MemorySourceInput } from './build-dataset.ts';

/** Build clock of the fixture: 15 June 2024, 18:00 local time. */
export const NOW = new Date(2024, 5, 15, 18);

const pad = (n: number) => String(n).padStart(2, '0');
/** A ride starting at the host-local wall time `y-m-d h:00` (written local start time and actual start agree). */
const ride = (id: string, [y, m, d, h]: [number, number, number, number], extra: Record<string, unknown>) => {
  const start = new Date(y, m - 1, d, h);
  return {
    id, name: `Demo ride ${id.slice(-1)}`, sport_type: 'Ride', start_date: start.toISOString(),
    start_date_local: `${y}-${pad(m)}-${pad(d)}T${pad(h)}:00:00`, gear_id: 'bdemo1',
    distance: 50000, moving_time: 7200, elapsed_time: 7800, total_elevation_gain: 600, average_speed: 6.9, max_speed: 15,
    device_watts: true, average_watts: 200, has_heartrate: true, average_heartrate: 140, suffer_score: 80,
    ...extra,
  };
};

export const RIDES: MemorySourceInput['rides'] = [
  ride('demo-0001', [2023, 5, 10, 9], {
    metrics: { np: 220, power_curve: { 5: 800, 60: 400, 1200: 270 } },
    summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
    geo: { places: [{ name: 'Hilltown', region: 'North', country: 'NZ' }] },
    elev_low: '12.4', elev_high: 512, perceived_exertion: 6, device_name: 'Head unit',
    laps: [{ lap_index: 1, name: 'Lap 1', distance: 25000 }, { lap_index: 2, name: 'Lap 2', distance: 25000 }],
    splits_metric: [{ split: 1, moving_time: 140 }, { split: 2, moving_time: 150 }],
    segment_efforts: [{ segment_id: 'demo-seg-hill', name: 'Hill', distance: 2000, average_grade: 5, climb_category: 1, city: 'Hilltown', elapsed_time: 320, average_watts: 260, start_index: 10, end_index: 30 }],
  }),
  ride('demo-0002', [2024, 4, 20, 8], {
    sport_type: 'GravelRide', streams: true,
    metrics: { np: 230, power_curve: { 5: 850, 60: 380, 1200: 280, 3600: 250 } },
    segment_efforts: [{ segment_id: 'demo-seg-hill', name: 'Hill', distance: 2000, average_grade: 5, climb_category: 1, city: 'Hilltown', elapsed_time: 300, average_watts: 270, pr_rank: 1, start_index: 1, end_index: 2 }],
  }),
  ride('demo-0003', [2024, 6, 14, 7], {
    sport_type: 'VirtualRide', trainer: true, gear_id: 'bdemo2', metrics: { np: 210, power_curve: { 5: 700 } },
    segment_efforts: [{ segment_id: 'demo-seg-flat', name: 'Flat', distance: 1000, elapsed_time: 90 }],
  }),
  ride('demo-0004', [2024, 6, 15, 7], { sport_type: 'EBikeRide', metrics: { np: 300, power_curve: { 5: 1200 } } }),
  // Later on the build day: not admitted yet
  ride('demo-0005', [2024, 6, 15, 20], { metrics: { np: 400, power_curve: { 60: 999 } } }),
];

export const SOURCE: MemorySourceInput = {
  demo: false,
  athlete: {
    profile: { first_name: 'Jane', last_name: 'Rider', weight: 70 }, zones: { ftp: 250 },
    gear: [{ id: 'bdemo1', name: 'Gravel bike' }, { id: 'gdemo1', name: 'Shoes', type: 'shoe', distance: 120000, brand: 'Acme' }],
  },
  history: [{ date: '2023-01-01', ftp: 240, weight: 72, source: 'test' }, { date: '2024-03-01', ftp: 260, weight: 70, note: 'Spring' }],
  gear: [
    { id: 'bdemo1', name: 'Gravel bike', brand: 'Acme', model: 'Dirt', frame_type: 'Gravel', primary: true,
      custom: { price_eur: 2000, purchase_date: '2022-06-15', components: ['1x12'], color: 'Grey', notes: 'Tubeless' } },
    { id: 'bdemo2', name: 'Trainer bike', retired: true },
  ],
  rides: RIDES,
  streams: { 'demo-0002': { time: [0, 1, 2], latlng: [[-41.1, 174.1], [-41.2, 174.2], [-41.3, 174.3]], watts: [200, 210, 220] } },
};

/** The fixture's build dataset (fresh copy each time). */
export const fixtureDataset = (): Promise<BuildDataset> => createBuildDataset(memorySource(structuredClone(SOURCE)), { now: NOW });
