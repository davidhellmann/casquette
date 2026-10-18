import { describe, it, expect } from 'vitest';
import { zoneIdx, cogganZones, DEFAULT_ZONES, DEFAULT_HR_ZONES, POWER_ZONE_NAMES, HR_ZONE_NAMES } from './index.js';

const HR = [{ min: 0, max: 129 }, { min: 130, max: 149 }, { min: 150, max: 164 }, { min: 165, max: 179 }, { min: 180, max: null }];

describe('zoneIdx – zone assignment of a value', () => {
  it('assigns values on zone boundaries to the zone whose min they reach', () => {
    expect(zoneIdx(129, HR)).toBe(0);
    expect(zoneIdx(130, HR)).toBe(1);
    expect(zoneIdx(149, HR)).toBe(1);
    expect(zoneIdx(150, HR)).toBe(2);
  });

  it('puts everything from the top zone lower bound into the open top zone', () => {
    expect(zoneIdx(180, HR)).toBe(4);
    expect(zoneIdx(250, HR)).toBe(4);
  });

  it('puts values below Z1 into Z1', () => {
    const from100 = [{ min: 100, max: 150 }, { min: 151, max: null }];
    expect(zoneIdx(50, from100)).toBe(0);
    expect(zoneIdx(0, HR)).toBe(0);
    expect(zoneIdx(-5, HR)).toBe(0);
  });

  it('treats a missing min as 0', () => {
    expect(zoneIdx(10, [{ max: 99 }, { min: 100, max: null }])).toBe(0);
  });
});

describe('cogganZones – power zones from FTP', () => {
  it('returns 7 gapless Coggan zones (55/75/90/105/120/150 % FTP)', () => {
    expect(cogganZones(200)).toEqual([
      { min: 0, max: 110 },
      { min: 111, max: 150 },
      { min: 151, max: 180 },
      { min: 181, max: 210 },
      { min: 211, max: 240 },
      { min: 241, max: 300 },
      { min: 301, max: null },
    ]);
  });

  it('rounds the boundaries to whole watts', () => {
    const z = cogganZones(263);
    expect(z[0].max).toBe(145); // 144.65
    expect(z[1].min).toBe(146);
    expect(z[4].max).toBe(316); // 315.6
  });

  it('assigns watts on Coggan zone boundaries correctly', () => {
    const z = cogganZones(200);
    expect(zoneIdx(110, z)).toBe(0);
    expect(zoneIdx(111, z)).toBe(1);
    expect(zoneIdx(300, z)).toBe(5);
    expect(zoneIdx(301, z)).toBe(6);
    expect(zoneIdx(2000, z)).toBe(6);
  });
});

describe('default zones', () => {
  it('uses FTP 200 with Coggan power zones without athlete data', () => {
    expect(DEFAULT_ZONES.ftp).toBe(200);
    expect(DEFAULT_ZONES.power_zones).toEqual(cogganZones(200));
  });

  it('has 5 gapless default HR zones with an open top zone', () => {
    expect(DEFAULT_HR_ZONES).toEqual([{ min: 0, max: 129 }, { min: 130, max: 149 }, { min: 150, max: 164 }, { min: 165, max: 179 }, { min: 180, max: null }]);
    expect(DEFAULT_ZONES.heart_rate_zones).toEqual(DEFAULT_HR_ZONES);
  });

  it('names every default zone', () => {
    expect(POWER_ZONE_NAMES).toHaveLength(DEFAULT_ZONES.power_zones.length);
    expect(HR_ZONE_NAMES).toHaveLength(DEFAULT_HR_ZONES.length);
    expect(POWER_ZONE_NAMES[1]).toBe('Endurance');
    expect(HR_ZONE_NAMES[1]).toBe('Endurance');
  });
});
