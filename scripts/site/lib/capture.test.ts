import { describe, expect, it } from 'vitest';
import { findBrowser } from './capture.ts';

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
