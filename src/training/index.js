/**
 * Training module – domain rules for sync (Node), build (Astro) and browser.
 * Pure and I/O-free; the single entry point for callers.
 */
export { zoneIdx, cogganZones, DEFAULT_ZONES, DEFAULT_HR_ZONES, POWER_ZONE_NAMES, HR_ZONE_NAMES } from './zones.js';
export { ftpRecommendation, decouplingStatus, DECOUPLING_LIMITS, dailyNeeds } from './recommendations.js';
export { fuel, fuelCell } from './fueling.js';
export { isRide, countsInStats } from './ride-type.js';
export { athleteTimeline, DEFAULT_WEIGHT } from './athlete-state.js';
export { bestCurve } from './power-curve.js';
export { rideCalendar } from './ride-calendar.js';
export { rideLoad, fitnessSeries, CTL_DAYS, ATL_DAYS } from './fitness.js';
export { calendarDate, calendarDay, rideDate, startOfDay, addDays, weekStart, dayOrdinal, ordinalDay, daysBetween, isoWeek, yearDayIndex, sameDayLastYear } from './calendar-day.js';
export { records, RECORD_KINDS } from './records.js';
export { trainingCalendar, yearTotals } from './training-calendar.js';
