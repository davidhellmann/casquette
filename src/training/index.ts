// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Training module – domain rules for sync (Node), build (Astro) and browser.
 * Pure and I/O-free; the single entry point for callers.
 */
export { zoneIdx, cogganZones, DEFAULT_ZONES, DEFAULT_HR_ZONES, POWER_ZONE_NAMES, HR_ZONE_NAMES } from './zones.ts';
export { ftpRecommendation, decouplingStatus, DECOUPLING_LIMITS, dailyNeeds } from './recommendations.ts';
export { fuel, fuelCell } from './fueling.ts';
export { isRide, countsInStats, eBikeKind, isIndoor } from './ride-type.ts';
export { athleteTimeline, DEFAULT_WEIGHT } from './athlete-state.ts';
export { bestCurve } from './power-curve.ts';
export { rideCalendar } from './ride-calendar.ts';
export { rideLoad, fitnessSeries, CTL_DAYS, ATL_DAYS } from './fitness.ts';
export { calendarDate, calendarDay, rideDate, startOfDay, addDays, weekStart, dayOrdinal, ordinalDay, daysBetween, isoWeek, yearDayIndex, sameDayLastYear } from './calendar-day.ts';
export { records, RECORD_KINDS } from './records.ts';
export { trainingCalendar, yearTotals } from './training-calendar.ts';
