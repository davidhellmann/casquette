import { describe, it, expect } from 'vitest';
import { fuel, fuelCell } from './index.ts';

describe('fuel – fueling recommendation by duration & intensity', () => {
  it('recommends only water for easy rides under 1 h', () => {
    expect(fuel(45 * 60, 2)).toMatchObject({ gph: 0, total: 0, ml: '400–600 ml' });
  });

  it('treats zone 3 and above as intense', () => {
    expect(fuel(90 * 60, 2).gph).toBe(40);
    expect(fuel(90 * 60, 3).gph).toBe(60);
    expect(fuel(90 * 60, 3).total).toBe(90);
  });

  it('switches tier at 1 h and 2.5 h', () => {
    expect(fuel(3600, 1).gph).toBe(40);
    expect(fuel(2.5 * 3600, 1).gph).toBe(70);
    expect(fuel(2.5 * 3600, 4).gph).toBe(90);
  });

  it('treats a missing zone as easy and a missing duration as 0', () => {
    expect(fuel(3 * 3600, null).gph).toBe(70);
    expect(fuel(null, 5).total).toBe(0);
  });
});

describe('fuelCell – cell of the fueling matrix', () => {
  it('combines duration (s/m/l) and intensity (l/h)', () => {
    expect(fuelCell(30 * 60, 1)).toBe('s-l');
    expect(fuelCell(2 * 3600, 3)).toBe('m-h');
    expect(fuelCell(4 * 3600, null)).toBe('l-l');
  });
});
