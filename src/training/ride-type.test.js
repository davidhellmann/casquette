import { describe, it, expect } from 'vitest';
import { isRide, countsInStats } from './index.js';

// All Strava cycling sport types (sport_type) – see GLOSSARY.md "Ride" / "Stat ride".
const HUMAN_POWERED = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'Velomobile', 'Handcycle'];
const E_BIKES = ['EBikeRide', 'EMountainBikeRide'];
const NOT_RIDES = ['Run', 'TrailRun', 'Walk', 'Hike', 'Swim', 'Workout', 'WeightTraining', 'NordicSki', 'InlineSkate', 'Rowing', '', null, undefined];

describe('isRide – ride (sync)', () => {
  it('recognises every Strava cycling type as a ride, e-bikes included', () => {
    for (const t of [...HUMAN_POWERED, ...E_BIKES]) expect(isRide(t), t).toBe(true);
  });
  it('rejects other sports and missing types', () => {
    for (const t of NOT_RIDES) expect(isRide(t), String(t)).toBe(false);
  });
});

describe('countsInStats – stat ride (pages)', () => {
  it('counts human-powered rides', () => {
    for (const t of HUMAN_POWERED) expect(countsInStats(t), t).toBe(true);
  });
  it('excludes e-bike and e-MTB rides', () => {
    for (const t of E_BIKES) expect(countsInStats(t), t).toBe(false);
  });
  it('counts nothing that is not a ride', () => {
    for (const t of NOT_RIDES) expect(countsInStats(t), String(t)).toBe(false);
  });
  it('every stat ride is a ride', () => {
    for (const t of [...HUMAN_POWERED, ...E_BIKES, ...NOT_RIDES]) if (countsInStats(t)) expect(isRide(t)).toBe(true);
  });
});
