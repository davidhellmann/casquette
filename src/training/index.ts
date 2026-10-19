/**
 * Training module – domain rules for sync (Node), build (Astro) and browser.
 * Pure and I/O-free; the single entry point for callers.
 */
export { zoneIdx, cogganZones, DEFAULT_ZONES, DEFAULT_HR_ZONES, POWER_ZONE_NAMES, HR_ZONE_NAMES } from './zones.ts';
export type { Basis, Zone, ZoneSet, Zones } from './zones.ts';
export type { ZonesFile } from './zones-file.ts';
export { ftpRecommendation, decouplingStatus, DECOUPLING_LIMITS, dailyNeeds } from './recommendations.ts';
export type { FtpRecommendation, DecouplingStatus, DailyNeeds, NeedsCategory, Nutrients, Range } from './recommendations.ts';
export { fuel, fuelCell } from './fueling.ts';
export type { Fueling, FuelCell } from './fueling.ts';
export { isRide, countsInStats, eBikeKind, isIndoor } from './ride-type.ts';
export type { EBikeKind } from './ride-type.ts';
export { athleteTimeline, DEFAULT_WEIGHT } from './athlete-state.ts';
export type {
  AthleteData, AthleteHistoryEntry, AthleteState, AthleteTimeline, AthleteTimelineInput, AthleteZones,
  DatedHistoryEntry, ZoneSource,
} from './athlete-state.ts';
export { bestCurve } from './power-curve.ts';
export type { BestCurve, PowerCurve } from './power-curve.ts';
export { rideCalendar } from './ride-calendar.ts';
export type { CalendarRide, RideCalendar } from './ride-calendar.ts';
export { rideLoad, fitnessSeries, CTL_DAYS, ATL_DAYS } from './fitness.ts';
export type { FitnessDay, FitnessRide, LoadInput } from './fitness.ts';
export { calendarDate, calendarDay, rideDate, startOfDay, addDays, weekStart, dayOrdinal, ordinalDay, daysBetween, isoWeek, yearDayIndex, sameDayLastYear } from './calendar-day.ts';
export type { CalendarInput } from './calendar-day.ts';
export { records, RECORD_KINDS } from './records.ts';
export type { RecordKind, RecordRide, Records } from './records.ts';
export { trainingCalendar, yearTotals } from './training-calendar.ts';
export type {
  TrainingCalendar, TrainingCalendarCell, TrainingCalendarDay, TrainingCalendarLevel, TrainingCalendarMeasure,
  TrainingCalendarOptions, TrainingCalendarRide, YearTotal,
} from './training-calendar.ts';
