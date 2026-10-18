import { describe, expect, it } from 'vitest';
import { computeMetrics, timeInZones } from './metrics.mjs';
import { rideFrontmatter } from './ride-file.mjs';
import { athleteTimeline, rideLoad } from '../../src/training/index.js';
import { processRide } from '../../src/ride/index.js';

const activity = { id: '7', start_date_local: '2024-05-01T12:00:00', moving_time: 3600, device_watts: true, average_watts: 180, weighted_average_watts: 240, weight_kg: 80, average_heartrate: 150 };
const athleteState = (ftp = 200, weight = 80) => athleteTimeline({ history: [{ date: '2024-01-01', ftp, weight }] }).at(activity.start_date_local);
const forbidden = ['intensity_factor', 'tss', 'avg_wkg', 'np_wkg', 'ftp_used'];
const streams = { time: { data: [0, 1, 4, 7, 30, 32, 32, 34] }, watts: { data: [100, 0, 151, 151, 900, 201, 999, null] } };

describe('sync → frontmatter → ride', () => {
  it('persists only independent metrics, identical for a different FTP/weight', () => {
    const a = computeMetrics(activity, streams, athleteState().zones);
    const b = computeMetrics({ ...activity, weight_kg: 50 }, streams, athleteState(300).zones);
    forbidden.forEach((key) => expect(a).not.toHaveProperty(key));
    expect(a).not.toHaveProperty('time_in_power_zones');
    expect(a).toEqual(b);
    expect(a).toMatchObject({ np: 240, variability_index: 1.333, power_curve: expect.any(Object),
      power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[0, 1], [151, 6], [201, 2]] } });
  });

  it('computes historical TIZ exactly against raw sampling, without new sync data', () => {
    const metrics = computeMetrics(activity, streams, athleteState().zones);
    const fm = rideFrontmatter({ id: '7', summary: activity, metrics });
    for (const ftp of [150, 200, 300]) {
      const r = processRide(fm, athleteState(ftp));
      expect(r.tizP).toEqual(timeInZones(streams.time.data, streams.watts.data, athleteState(ftp).zones.power_zones));
      expect(r.tizBasis.power).toMatchObject({ source: 'distribution', ftp, zones: athleteState(ftp).zones.power_zones, exact: true });
    }
    expect(processRide(fm, athleteState(200, 80))).toMatchObject({ if_: 1.2, tss: 144, np_wkg: 3, avg_wkg: 2.25 });
    expect(processRide(fm, athleteState(300, 60))).toMatchObject({ if_: 0.8, tss: 64, np_wkg: 4, avg_wkg: 3 });
  });

  it('stores an HR distribution instead of HR time in zones; the build applies the HR zones on the ride date', () => {
    const t = [0, 1, 4, 7, 30, 32, 34, 36], h = [120, 0, 131, 131, 175, 150, null, 181];
    const metrics = computeMetrics(activity, { time: { data: t }, heartrate: { data: h } }, athleteState().zones);
    expect(metrics).not.toHaveProperty('time_in_hr_zones');
    expect(metrics).not.toHaveProperty('time_in_hr_zones_basis');
    expect(metrics.hr_distribution).toEqual({ version: 1, method: 'right-sample-dt-0-10s', samples: [[0, 1], [131, 6], [150, 2], [181, 2]] });
    const fm = rideFrontmatter({ id: '7', summary: activity, metrics });
    const zonesFile = (bpm) => ({ heart_rate: [{ from: '2024-01-01', bpm }] });
    for (const bpm of [[0, 130, 150, 165, 180], [0, 140, 160, 170, 185]]) {
      const state = athleteTimeline({ zonesFile: zonesFile(bpm) }).at(activity.start_date_local);
      const r = processRide(fm, state);
      expect(r.tizH).toEqual(timeInZones(t, h, state.zones.heart_rate_zones));
      expect(r.tizBasis.hr).toMatchObject({ source: 'distribution', zones: state.zones.heart_rate_zones, exact: true });
    }
    expect(processRide(fm, athleteTimeline({ zonesFile: zonesFile([0, 130, 150, 165, 180]) }).at(activity.start_date_local)).tizH)
      .toEqual([1, 6, 2, 0, 2]);
  });

  it('keeps unrounded watt values at boundaries and irregular intervals', () => {
    const t = [0, 0.5, 2, 12, 23, 24];
    const w = [0, 110.5, 111, 150.5, 900, 151];
    const metrics = computeMetrics(activity, { time: { data: t }, watts: { data: w } }, athleteState().zones);
    expect(metrics.power_distribution.samples).toEqual([[110.5, 0.5], [111, 1.5], [150.5, 10], [151, 1]]);
    for (const ftp of [100, 200, 301]) expect(processRide({ ...activity, metrics }, athleteState(ftp)).tizP)
      .toEqual(timeInZones(t, w, athleteState(ftp).zones.power_zones));
  });

  it.each(['streams', 'summary'])('also cleans an old %s cache without losing independent data', (source) => {
    const metrics = Object.freeze({ source, np: 240, intensity_factor: 9, tss: 999, avg_wkg: 99, np_wkg: 99, ftp_used: 400,
      power_curve: { 60: 300 }, hr_curve: { 60: 170 }, variability_index: 1.2, decoupling_pct: 3,
      time_in_power_zones: [60, 120], time_in_hr_zones: [100, 80], computed_at: '2024-05-02' });
    const fm = rideFrontmatter({ id: '7', summary: activity, metrics });
    forbidden.forEach((key) => expect(fm.metrics).not.toHaveProperty(key));
    expect(fm.metrics).toMatchObject({ np: 240, power_curve: { 60: 300 }, hr_curve: { 60: 170 }, variability_index: source === 'summary' ? 1.333 : 1.2, decoupling_pct: 3,
      time_in_power_zones: [60, 120], time_in_hr_zones: [100, 80], computed_at: '2024-05-02',
      time_in_power_zones_basis: { source: 'legacy', ftp: 400, zones: null, exact: false } });
    const r = processRide(fm, athleteState());
    expect(r).toMatchObject({ tizP: [60, 120], tizBasis: { power: { source: 'legacy', ftp: 400, zones: null, exact: false } } });
    expect(processRide(fm, athleteState(300)).tizP).toEqual(r.tizP);
    expect(metrics).toHaveProperty('tss', 999);
  });

  it('invents no power distribution and no historical boundaries without raw data', () => {
    const fm = rideFrontmatter({ id: '7', summary: activity, metrics: { time_in_power_zones: [10, 20] } });
    expect(fm.metrics).not.toHaveProperty('power_distribution');
    expect(processRide(fm, athleteState()).tizBasis.power).toMatchObject({ source: 'legacy', ftp: null, zones: null, exact: false });
    const missing = rideFrontmatter({ id: '7', summary: activity });
    expect(processRide(missing, athleteState()).tizP).toBeNull();
    expect(missing).toEqual(rideFrontmatter({ id: '7', summary: activity }));
  });

  it.each([0, null, undefined, NaN, -1])('tells measured zero watts apart from missing/invalid streams (%s)', (value) => {
    const a = { ...activity, weighted_average_watts: null, average_watts: value === 0 ? 0 : null, suffer_score: 99 };
    const st = { time: { data: Array.from({ length: 3601 }, (_, i) => i) }, watts: { data: Array(3601).fill(value) } };
    const metrics = computeMetrics(a, st, athleteState().zones);
    const r = processRide(rideFrontmatter({ id: '7', summary: a, metrics }), athleteState());
    expect(r.np).toBe(value === 0 ? 0 : null);
    expect(r.tss).toBe(value === 0 ? 0 : null);
    expect(rideLoad(r)).toBe(value === 0 ? 0 : 99);
    expect(r.tizP).toEqual(value === 0 ? [3600, 0, 0, 0, 0, 0, 0] : null);
  });

  it.each([null, undefined, NaN, -1])('does not turn mixed zero-watt/invalid raw data into NP 0 (%s)', (invalid) => {
    for (const summaryNP of [null, 300]) {
      const a = { ...activity, weighted_average_watts: summaryNP, suffer_score: 99 };
      const st = { time: { data: Array.from({ length: 3601 }, (_, i) => i) }, watts: { data: [0, ...Array(3600).fill(invalid)] } };
      const metrics = computeMetrics(a, st, athleteState().zones);
      const r = processRide(rideFrontmatter({ id: '7', summary: a, metrics }), athleteState());
      expect(r.np).toBe(summaryNP);
      expect(r.tss).toBe(summaryNP == null ? null : 225);
      expect(rideLoad(r)).toBe(summaryNP == null ? 99 : 225);
      expect(metrics.power_curve).toEqual({ 1: 0 });
      expect(r.tizP).toBeNull();
    }
  });

  it.each(['missing', 'negative', 'NaN', 'time-gap', 'sparse'])('joins no power windows across measurement gaps (%s)', (kind) => {
    const watts = [...Array(30).fill(100), ...Array(30).fill(200)];
    const time = watts.map((_, i) => i);
    if (kind === 'time-gap') time.splice(30, 30, ...Array.from({ length: 30 }, (_, i) => 100 + i));
    else if (kind === 'sparse') time.splice(0, 60, ...time.map(i => i * 11));
    else { watts.splice(30, 0, kind === 'missing' ? null : kind === 'negative' ? -1 : NaN); time.push(60); }
    const metrics = computeMetrics({ ...activity, weighted_average_watts: null }, { time: { data: time }, watts: { data: watts } }, athleteState().zones);
    const r = processRide(rideFrontmatter({ id: '7', summary: { ...activity, weighted_average_watts: null, suffer_score: 99 }, metrics }), athleteState());
    expect(r.np).toBeNull();
    expect(r.load).toBe(99);
    expect(metrics.power_curve).not.toHaveProperty('60');
    expect(metrics.power_curve[1]).toBe(200);
    expect(metrics.power_curve[30]).toBe(kind === 'sparse' ? undefined : 200);
  });

  it('uses only complete NP windows from sufficiently long measured sections', () => {
    const watts = [...Array(60).fill(0), null, ...Array(60).fill(200)];
    const metrics = computeMetrics(activity, { time: { data: watts.map((_, i) => i) }, watts: { data: watts } }, athleteState().zones);
    const r = processRide(rideFrontmatter({ id: '7', summary: activity, metrics }), athleteState());
    expect(r.np).toBe(Math.round((200 ** 4 / 2) ** .25));
    expect(metrics.power_curve[60]).toBe(200);
    expect(metrics.power_curve).not.toHaveProperty('120');
  });

  it('keeps zero watts and HR boundaries and rejects an unknown power distribution version', () => {
    const metrics = computeMetrics(activity, { time: { data: [0, 2, 4] }, watts: { data: [0, 0, 0] }, heartrate: { data: [140, 140, 140] } }, athleteState().zones);
    expect(processRide({ ...activity, metrics }, athleteState())).toMatchObject({ tizP: [4, 0, 0, 0, 0, 0, 0], tizBasis: { hr: { zones: athleteState().zones.heart_rate_zones } } });
    const r = processRide({ ...activity, metrics: { power_distribution: { version: 99, samples: [[100, 99]] }, time_in_power_zones: [10] } }, athleteState());
    expect(r.tizP).toEqual([10]);
    expect(r.tizBasis.power.exact).toBe(false);
  });
});
