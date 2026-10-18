import { describe, expect, it } from 'vitest';
import { SHOTS, findBrowser, pickHeroRide, planShots, reviewYear, rideYears } from './screenshots.mjs';

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

describe('pickHeroRide', () => {
  const ride = (id, extra = {}) => ({ id, trainer: false, device_watts: true, has_heartrate: true, summary_polyline: 'abc', ...extra });

  it('picks the newest outdoor ride that has power, heart rate and a route', () => {
    const rides = [
      ride('demo-0003'),
      ride('demo-0010', { trainer: true }),
      ride('demo-0009', { device_watts: false }),
      ride('demo-0008', { has_heartrate: false }),
      ride('demo-0007', { summary_polyline: '' }),
      ride('demo-0005'),
    ];
    expect(pickHeroRide(rides)).toBe('demo-0005');
  });

  it('fails loudly when no ride can carry the ride-detail shot', () => {
    expect(() => pickHeroRide([ride('demo-0001', { trainer: true })])).toThrow(/no ride/i);
  });
});

describe('findBrowser', () => {
  const candidates = ['/a/Chromium', '/b/Chrome'];

  it('prefers CHROME_PATH, then the first installed candidate', () => {
    expect(findBrowser({ env: { CHROME_PATH: '/custom/chrome' }, candidates, exists: () => false })).toBe('/custom/chrome');
    expect(findBrowser({ env: {}, candidates, exists: (p) => p === '/b/Chrome' })).toBe('/b/Chrome');
  });

  it('explains how to point at a browser when none is installed', () => {
    expect(() => findBrowser({ env: {}, candidates, exists: () => false })).toThrow(/CHROME_PATH/);
  });
});

describe('SHOTS', () => {
  it('frames close-ups by data-testid hooks, not by styling classes or ids', () => {
    for (const { focus } of SHOTS.filter((s) => s.focus)) expect(focus).toMatch(/^\[data-testid="[a-z-]+"\]$/);
  });
});

describe('rideYears', () => {
  it('lists every year with rides once, from the local start date', () => {
    const rides = [{ start_date_local: '2025-12-31T23:30:00' }, { start_date_local: '2026-01-01T08:00:00' }, { start_date_local: '2025-06-01T08:00:00' }, {}];
    expect(rideYears(rides).sort()).toEqual(['2025', '2026']);
  });
});

describe('reviewYear', () => {
  it('shows the last complete year, not the running one', () => {
    expect(reviewYear(['2024', '2026', '2023', '2025'])).toBe(2025);
  });

  it('falls back to the only year there is', () => {
    expect(reviewYear(['2026'])).toBe(2026);
  });
});
