// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { activityUrl, gearUrl, isStravaId, segmentUrl } from './strava-links.ts';

// Refs #13: demo ids (`demo-0165`, `demo-seg-mesa-1`, `bdemo2`) must never become strava.com links.
describe('isStravaId', () => {
  it('accepts numeric Strava ids only', () => {
    expect(isStravaId('12345678901')).toBe(true);
    expect(isStravaId(987)).toBe(true);
    expect(isStravaId('demo-0165')).toBe(false);
    expect(isStravaId('demo-seg-mesa-1')).toBe(false);
    expect(isStravaId('')).toBe(false);
    expect(isStravaId(null)).toBe(false);
  });
});

describe('Strava links', () => {
  it('links real activities and segments', () => {
    expect(activityUrl('12345')).toBe('https://www.strava.com/activities/12345');
    expect(segmentUrl(678)).toBe('https://www.strava.com/segments/678');
  });

  it('links real bikes and shoes by their gear id', () => {
    expect(gearUrl('b4711')).toBe('https://www.strava.com/bikes/4711');
    expect(gearUrl('g815')).toBe('https://www.strava.com/shoes/815');
  });

  it('returns no link for demo ids', () => {
    expect(activityUrl('demo-0165')).toBeNull();
    expect(segmentUrl('demo-seg-mesa-1')).toBeNull();
    expect(gearUrl('bdemo2')).toBeNull();
  });
});
