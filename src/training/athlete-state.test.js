import { describe, it, expect } from 'vitest';
import { athleteTimeline, cogganZones, DEFAULT_HR_ZONES } from './index.js';

const STRAVA_HR = [{ min: 0, max: 141 }, { min: 141, max: 155 }, { min: 155, max: 165 }, { min: 165, max: 178 }, { min: 178, max: null }];
// Deliberately not Coggan: Strava's power zones must not override the date-based derivation.
const STRAVA_POWER = [{ min: 0, max: 140 }, { min: 141, max: 190 }, { min: 191, max: 225 }, { min: 226, max: 260 }, { min: 261, max: 300 }, { min: 301, max: 375 }, { min: 376, max: null }];
const ATHLETE = {
  profile: { first_name: 'D', weight: 80, ftp: 250 },
  zones: { ftp: 250, power_zones: STRAVA_POWER, heart_rate_zones: STRAVA_HR, heart_rate_zone_source: 'Manual' },
};

describe('athleteTimeline – athlete state on a date', () => {
  it('returns the defaults without athlete data and history (FTP 200 W, 75 kg, Coggan and default HR zones)', () => {
    const s = athleteTimeline({}).at('2024-05-01');
    expect(s.ftp).toBe(200);
    expect(s.weight).toBe(75);
    expect(s.zones.ftp).toBe(200);
    expect(s.zones.power_zones).toEqual(cogganZones(200));
    expect(s.zones.heart_rate_zones).toEqual(DEFAULT_HR_ZONES);
  });

  it('uses current FTP/weight and HR zones with an empty history, but Coggan power zones', () => {
    const s = athleteTimeline({ athlete: ATHLETE, history: [] }).at('2015-03-01');
    expect(s.ftp).toBe(250);
    expect(s.weight).toBe(80);
    expect(s.zones.power_zones).toEqual(cogganZones(250));
    expect(s.zones.heart_rate_zones).toEqual(STRAVA_HR);
    expect(s.zones.heart_rate_zone_source).toBe('Manual');
  });

  const HISTORY = [
    { date: '2024-06-01', ftp: 250, weight: 80 }, // unsorted, as if added by hand
    { date: '2020-01-01', ftp: 210, weight: 88 },
  ];

  it('between two entries uses the last entry on or before the date', () => {
    const t = athleteTimeline({ athlete: ATHLETE, history: HISTORY });
    expect(t.at('2022-07-15')).toMatchObject({ ftp: 210, weight: 88 });
    expect(t.at('2024-06-01')).toMatchObject({ ftp: 250, weight: 80 });
    expect(t.at(new Date('2024-05-31T18:00:00Z'))).toMatchObject({ ftp: 210, weight: 88 });
  });

  it('history applies from the local calendar day, not from UTC midnight', () => {
    const t = athleteTimeline({ history: [{ date: '2024-01-01', ftp: 200, weight: 100 }, { date: '2024-06-01', ftp: 300, weight: 60 }] });
    for (const date of ['2024-06-01', '2024-06-01T00:30:00+02:00', '2024-06-01T00:01:00+14:00', '2024-06-01T23:59:00-12:00', new Date(2024, 5, 1, 0, 1)]) {
      expect(t.at(date)).toMatchObject({ ftp: 300, weight: 60 });
    }
    for (const date of ['2024-05-31T23:59:00-10:00', '2024-05-31T23:59:00+02:00', new Date(2024, 4, 31, 23, 59)]) {
      expect(t.at(date)).toMatchObject({ ftp: 200, weight: 100 });
    }
    // Date has lost the source offset: use the host-local day, not a guessed ride zone.
    const instant = new Date('2024-06-01T00:30:00+14:00');
    expect(t.at(instant)).toEqual(t.at(new Date(instant.getFullYear(), instant.getMonth(), instant.getDate())));
  });

  it('before the first entry uses the first entry (earliest known athlete state)', () => {
    const s = athleteTimeline({ athlete: ATHLETE, history: HISTORY }).at('2012-05-02');
    expect(s).toMatchObject({ ftp: 210, weight: 88 });
  });

  it('carries FTP and weight forward separately: entries with only FTP or only weight change only their value', () => {
    const t = athleteTimeline({ athlete: ATHLETE, history: [
      { date: '2020-01-01', ftp: 210, weight: 88 },
      { date: '2021-01-01', ftp: 230 },
      { date: '2022-01-01', weight: 84, ftp: null },
    ] });
    expect(t.at('2021-06-01')).toMatchObject({ ftp: 230, weight: 88 });
    expect(t.at('2022-06-01')).toMatchObject({ ftp: 230, weight: 84 });
  });

  it('takes a value the history never contains from the current athlete data', () => {
    const t = athleteTimeline({ athlete: ATHLETE, history: [{ date: '2020-01-01', weight: 88 }] });
    expect(t.at('2021-01-01')).toMatchObject({ ftp: 250, weight: 88 });
  });

  it('derives power zones from the FTP on the date (Coggan), HR zones stay the current ones', () => {
    const s = athleteTimeline({ athlete: ATHLETE, history: HISTORY }).at('2022-07-15');
    expect(s.zones.ftp).toBe(210);
    expect(s.zones.power_zones).toEqual(cogganZones(210));
    expect(s.zones.heart_rate_zones).toEqual(STRAVA_HR);
  });

  it('always derives power zones via Coggan, even when the current FTP is the same', () => {
    const s = athleteTimeline({ athlete: ATHLETE, history: HISTORY }).at('2025-01-01');
    expect(s.zones.power_zones).toEqual(cogganZones(250));
  });

  it('ignores invalid measurements per field and uses only positive finite numbers', () => {
    const t = athleteTimeline({ athlete: { profile: { weight: -1 }, zones: { ftp: -200 } }, history: [
      { date: '2020-01-01', ftp: 220, weight: 90 },
      { date: '2021-01-01', ftp: 0, weight: -10 },
      { date: '2022-01-01', ftp: Infinity, weight: '80' },
    ] });
    expect(t.at('2023-01-01')).toMatchObject({ ftp: 220, weight: 90 });
    expect(athleteTimeline({ athlete: { profile: { weight: -1 }, zones: { ftp: -200 } } }).at('2020-01-01'))
      .toMatchObject({ ftp: 200, weight: 75 });
  });

  it('uses the earliest known value for FTP and weight independently', () => {
    const t = athleteTimeline({ history: [{ date: '2020-01-01', ftp: 220 }, { date: '2021-01-01', weight: 90 }] });
    expect(t.at('2010-01-01')).toMatchObject({ ftp: 220, weight: 90 });
  });

  it('falls back to the default HR zones for an empty HR zone list', () => {
    expect(athleteTimeline({ athlete: { zones: { heart_rate_zones: [] } } }).at('2020-01-01').zones.heart_rate_zones)
      .toEqual(DEFAULT_HR_ZONES);
  });

  it('exposes the history sorted ascending, without entries lacking a valid date', () => {
    const t = athleteTimeline({ history: [...HISTORY, { ftp: 300 }, { date: 'broken', ftp: 1 }] });
    expect(t.history.map((x) => x.date)).toEqual(['2020-01-01', '2024-06-01']);
    expect(t.history[0].d).toEqual(new Date(2020, 0, 1));
  });
});

describe('athleteTimeline – zones file', () => {
  const FILE_HR = [{ min: 0, max: 124 }, { min: 125, max: 144 }, { min: 145, max: 159 }, { min: 160, max: 174 }, { min: 175, max: null }];

  it('without a zones file, HR zones come from Strava and power zones are Coggan', () => {
    const s = athleteTimeline({ athlete: ATHLETE }).at('2024-05-01');
    expect(s.zones.heart_rate_zones).toEqual(STRAVA_HR);
    expect(s.zones.power_zones).toEqual(cogganZones(250));
    expect(s.zones.source).toEqual({ hr: 'strava', power: 'default' });
  });

  it('without a zones file and without Strava HR zones, the default HR zones apply', () => {
    expect(athleteTimeline({}).at('2024-05-01').zones.source).toEqual({ hr: 'default', power: 'default' });
    // The sync writes the default zones with source "Default" when Strava's zones are unavailable.
    const synced = { zones: { heart_rate_zones: DEFAULT_HR_ZONES, heart_rate_zone_source: 'Default' } };
    expect(athleteTimeline({ athlete: synced }).at('2024-05-01').zones.source.hr).toBe('default');
  });

  it('HR zones from the file replace Strava\'s, given as lower bounds in bpm', () => {
    const s = athleteTimeline({ athlete: ATHLETE, zonesFile: { heart_rate: [{ bpm: [0, 125, 145, 160, 175] }] } }).at('2024-05-01');
    expect(s.zones.heart_rate_zones).toEqual(FILE_HR);
    expect(s.zones.source).toEqual({ hr: 'file', power: 'default' });
  });

  it('dated HR zones apply from their date (local calendar day); before the first date the first entry applies', () => {
    const t = athleteTimeline({ athlete: ATHLETE, zonesFile: { heart_rate: [
      { from: '2025-03-01', bpm: [0, 130, 150, 165, 180] }, // unsorted, as if added by hand
      { from: '2023-01-01', bpm: [0, 125, 145, 160, 175] },
    ] } });
    expect(t.at('2022-06-01').zones.heart_rate_zones).toEqual(FILE_HR);
    expect(t.at('2025-02-28T23:30:00+01:00').zones.heart_rate_zones).toEqual(FILE_HR);
    expect(t.at('2025-03-01T00:30:00+01:00').zones.heart_rate_zones).toEqual(DEFAULT_HR_ZONES);
    expect(t.at('2026-01-01').zones.heart_rate_zones).toEqual(DEFAULT_HR_ZONES);
  });

  it('an HR entry without a date applies from the beginning', () => {
    const t = athleteTimeline({ zonesFile: { heart_rate: [
      { from: '2025-03-01', bpm: [0, 130, 150, 165, 180] },
      { bpm: [0, 125, 145, 160, 175] },
    ] } });
    expect(t.at('2010-01-01').zones.heart_rate_zones).toEqual(FILE_HR);
    expect(t.at('2025-03-01').zones.heart_rate_zones).toEqual(DEFAULT_HR_ZONES);
  });

  it('custom power zone bounds (lower bounds in % of FTP) replace Coggan and follow the FTP on the date', () => {
    const t = athleteTimeline({ athlete: ATHLETE, history: [{ date: '2024-06-01', ftp: 250 }, { date: '2020-01-01', ftp: 210 }], zonesFile: { power: { ftp_percent: [0, 60, 80, 95, 105, 120, 150] } } });
    const s = t.at('2022-07-15'); // FTP 210 W
    expect(s.zones.power_zones).toEqual([
      { min: 0, max: 126 }, { min: 127, max: 168 }, { min: 169, max: 200 }, { min: 201, max: 221 },
      { min: 222, max: 252 }, { min: 253, max: 315 }, { min: 316, max: null },
    ]);
    expect(s.zones.source).toEqual({ hr: 'strava', power: 'file' });
    expect(t.at('2025-01-01').zones.power_zones[1]).toEqual({ min: 151, max: 200 }); // FTP 250 W
  });

  it.each([
    ['HR zones that are not 5 lower bounds', { heart_rate: [{ bpm: [0, 130, 150, 165] }] }, /heart_rate\[0\]\.bpm/],
    ['HR bounds that do not rise', { heart_rate: [{ bpm: [0, 130, 130, 165, 180] }] }, /heart_rate\[0\]\.bpm/],
    ['HR bounds that do not start at 0', { heart_rate: [{ bpm: [100, 130, 150, 165, 180] }] }, /heart_rate\[0\]\.bpm/],
    ['an invalid HR date', { heart_rate: [{ from: 'March', bpm: [0, 130, 150, 165, 180] }] }, /heart_rate\[0\]\.from/],
    ['two HR entries for the same date', { heart_rate: [{ bpm: [0, 130, 150, 165, 180] }, { bpm: [0, 131, 150, 165, 180] }] }, /heart_rate\[1\]\.from/],
    ['HR zones that are not a list', { heart_rate: { bpm: [0, 130, 150, 165, 180] } }, /heart_rate/],
    ['power bounds that are not 7 percentages', { power: { ftp_percent: [0, 55, 75, 90, 105, 120] } }, /power\.ftp_percent/],
    ['power bounds that do not rise', { power: { ftp_percent: [0, 55, 75, 90, 105, 150, 120] } }, /power\.ftp_percent/],
  ])('rejects a zones file with %s, naming the field', (_, zonesFile, field) => {
    expect(() => athleteTimeline({ zonesFile })).toThrow(field);
    expect(() => athleteTimeline({ zonesFile })).toThrow(/zones\.json/);
  });

  it('accepts an empty zones file and one with notes', () => {
    expect(athleteTimeline({ athlete: ATHLETE, zonesFile: {} }).at('2024-01-01').zones.source).toEqual({ hr: 'strava', power: 'default' });
    expect(athleteTimeline({ zonesFile: { note: 'mine', heart_rate: [], power: null } }).at('2024-01-01').zones.source).toEqual({ hr: 'default', power: 'default' });
  });
});

