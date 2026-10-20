import { describe, expect, it } from 'vitest';
import { polarization } from './overview-data.ts';
import { DEFAULT_ZONES } from '../../training/index.ts';
import type { DecodedPeriod } from '../../lib/dashboard-payload.ts';

// Only the period stats the 80/20 check reads: too much Z3
const D = { S: { polarization: 'middle', low: 60, pZ1: 20, pZ2: 40, pZ3: 35, pZ4: 5, z2hWeek: 2 } } as unknown as DecodedPeriod;
const zones = { ...DEFAULT_ZONES, heart_rate_zones: [{ min: 0, max: 128 }, { min: 129, max: 146 }, { min: 147, max: 160 }, { min: 161, max: 172 }, { min: 173, max: null }] };

describe('80/20 check', () => {
  it('names the end of easy riding in watts by power', () => {
    expect(polarization(D, zones, 'power').hintHtml).toContain(`below ${DEFAULT_ZONES.power_zones[1].max} W`);
  });

  it('names the end of easy riding in bpm by heart rate', () => {
    const hint = polarization(D, zones, 'hr').hintHtml;
    expect(hint).toContain('below 146 bpm');
    expect(hint).not.toMatch(/\d W/);
  });
});
