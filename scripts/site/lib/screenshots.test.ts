// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { SHOTS, planShots } from './screenshots.ts';

describe('planShots', () => {
  it('expands every shot into one light and one dark capture with resolved URLs', () => {
    const plan = planShots({
      baseUrl: 'http://localhost:4321',
      ride: 'demo-0042',
      year: 2025,
      shots: [
        { name: 'ride', path: '/rides/{ride}/' },
        { name: 'year', path: '/years/{year}/', focus: '[data-testid="year-kpis"]' },
      ],
    });
    expect(plan).toEqual([
      { file: 'ride-light.webp', url: 'http://localhost:4321/rides/demo-0042/', theme: 'light', focus: null },
      { file: 'ride-dark.webp', url: 'http://localhost:4321/rides/demo-0042/', theme: 'dark', focus: null },
      { file: 'year-light.webp', url: 'http://localhost:4321/years/2025/', theme: 'light', focus: '[data-testid="year-kpis"]' },
      { file: 'year-dark.webp', url: 'http://localhost:4321/years/2025/', theme: 'dark', focus: '[data-testid="year-kpis"]' },
    ]);
  });
});

describe('SHOTS', () => {
  it('frames close-ups by data-testid hooks, not by styling classes or ids', () => {
    for (const { focus } of SHOTS.filter((s) => s.focus)) expect(focus).toMatch(/^\[data-testid="[a-z-]+"\]$/);
  });
});
