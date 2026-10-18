import { describe, expect, it } from 'vitest';
import { DECOUPLING_SCALE, rideClassification, rideDecoupling, rideTimeInZones, tizBasisLabel, toneBg, zoneBg } from './ride-presentation.js';

describe('ride classification as text', () => {
  const ride = { w: 212.4, hr: 151.6, clsP: { zone: 3, source: 'power' }, clsH: { zone: 4, source: 'hr' } };

  it('names what decided the zone and its measured value, per basis', () => {
    expect(rideClassification(ride, 'power')).toEqual({ zone: 3, source: 'power', estimated: false, src: 'Avg power', val: '212 W', title: 'Avg power: 212 W' });
    expect(rideClassification(ride, 'hr')).toMatchObject({ zone: 4, src: 'Avg HR', val: '152 bpm', title: 'Avg HR: 152 bpm' });
  });

  it('marks an effort estimate and shows a dash without a classification', () => {
    expect(rideClassification({ clsP: { zone: 2, source: 'effort' } })).toMatchObject({ estimated: true, title: 'estimated: ≈ Z2' });
    expect(rideClassification({ clsP: { zone: null, source: 'none' } })).toMatchObject({ zone: null, title: '–: –' });
  });
});

describe('TIZ basis labels from source codes', () => {
  it('labels power TIZ by its source', () => {
    expect(tizBasisLabel('power', { source: 'distribution', ftp: 260 })).toBe('FTP on ride date 260 W · raw sampling (gaps >10 s excluded)');
    expect(tizBasisLabel('power', { source: 'legacy', ftp: 250 })).toBe('Legacy · Sync FTP 250 W · boundaries not stored');
    expect(tizBasisLabel('power', { source: 'none', ftp: null })).toBe('Legacy · Sync FTP unknown · boundaries not stored');
  });

  it('labels HR TIZ by its source', () => {
    expect(tizBasisLabel('hr', { source: 'distribution' })).toBe('HR zones on ride date · raw sampling (gaps >10 s excluded)');
    expect(tizBasisLabel('hr', { source: 'sync' })).toBe('Stored at sync · HR zones of the sync day');
    expect(tizBasisLabel('hr', { source: 'legacy' })).toBe('Stored at sync · boundaries not stored');
  });

  it('shows ranges only where the basis knows its boundaries', () => {
    const ride = { tizP: [60, 120], tizBasis: { power: { source: 'legacy', ftp: null, zones: null } } };
    expect(rideTimeInZones(ride, 'power').rows).toEqual([
      { zone: 1, name: expect.any(String), range: 'Boundaries unknown', sec: 60 },
      { zone: 2, name: expect.any(String), range: 'Boundaries unknown', sec: 120 },
    ]);
    expect(rideTimeInZones({ tizH: null, tizBasis: {} }, 'hr').rows).toEqual([]);
  });
});

describe('decoupling on one scale', () => {
  it('runs to 1.5 × the drift limit', () => {
    expect(DECOUPLING_SCALE).toEqual([0, 5, 10, 15]);
  });

  it('gives value, status text, tone and position', () => {
    expect(rideDecoupling(3)).toMatchObject({ status: 'stable', tone: 'positive', value: '+3.0 %', share: 20 });
    expect(rideDecoupling(7.5)).toMatchObject({ status: 'moderate', tone: 'warning', share: 50 });
    expect(rideDecoupling(30)).toMatchObject({ status: 'drift', tone: 'negative', share: 100 });
    expect(rideDecoupling(-2)).toMatchObject({ value: '-2.0 %', share: 0 });
    expect(rideDecoupling(null)).toBeNull();
  });
});

it('maps zones and tones to their token classes', () => {
  expect([0, 1, 7, 9].map(zoneBg)).toEqual(['bg-zone-1', 'bg-zone-1', 'bg-zone-7', 'bg-zone-7']);
  expect(toneBg('warning')).toBe('bg-warning');
});
