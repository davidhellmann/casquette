/** Display: numbers, dates, durations, escaping in the UI locale – runs in the browser and during the Astro build. Domain rules, including calendar-day arithmetic, live in src/training/. */
import { LOCALE } from '../i18n/index.js';
import { calendarDate } from '../training/calendar-day.js';
const pad = (n) => String(n).padStart(2, '0');
export const nf = (v, dec = 0) => (v == null || isNaN(v) ? '–' : Number(v).toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
export const fmtDur = (s) => { const tm = Math.round((s || 0) / 60), h = Math.floor(tm / 60), m = tm % 60; return h ? `${h}:${pad(m)} h` : `${m} min`; };
/** Seconds → "m:ss" / "h:mm:ss"; `hours` always shows the hour ("0:05:12", elapsed time on a ride). */
export const fmtClock = (s, hours = false) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h || hours ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
/** Seconds → "h:mm" (time axis ticks). */
export const fmtHm = (s) => `${Math.floor((s || 0) / 3600)}:${pad(Math.floor(((s || 0) % 3600) / 60))}`;
export const fmtH = (h) => nf(h, 1) + ' h';
export const fmtDate = (d) => d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
export const fmtDateL = (d) => d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
/** "Mon, 03/06/2024" – `year`: 'numeric', '2-digit' or false (no year). */
export const fmtWeekdayDate = (d, year = 'numeric') => d.toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', ...(year ? { year } : {}) });
/** "Monday, 03 June 2024" (ride headers). */
export const fmtLongDate = (d) => d.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
/** "3 Jun" or, with `withYear`, "3 Jun 2024". */
export const fmtDayMonth = (d, withYear = false) => d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
/** Short weekday, e.g. "Sun" (second line of a date cell). */
export const fmtWeekday = (d) => d.toLocaleDateString(LOCALE, { weekday: 'short' });
/** "June 2024" (tooltips, key figures). */
export const fmtMonthYear = (d) => d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
/** "Jun 24" (axis ticks). */
export const fmtMonthYearShort = (d) => d.toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' });
/** "Jun" (calendar month labels). */
export const fmtMonthShort = (d) => d.toLocaleDateString(LOCALE, { month: 'short' });
/** "14:05" – time of day. */
export const fmtTime = (d) => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
/** Month key 'YYYY-MM' → local first-of-month date. */
export const monthStart = (key) => { const [y, m] = key.split('-'); return new Date(+y, +m - 1, 1); };
/** Month key 'YYYY-MM' → "June 2024". */
export const monthLabel = (key) => fmtMonthYear(monthStart(key));
/** Month key 'YYYY-MM' → "Jun 24" (axis ticks). */
export const monthTick = (key) => fmtMonthYearShort(monthStart(key));
/** 'YYYY-MM-DD' (local calendar day) → date in the UI locale. */
export const fmtIso = (s) => fmtDateL(calendarDate(s));
export const trunc = (s, n) => ((s || '').length > n ? s.slice(0, n - 1) + '…' : s || '');
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const zr = (z, u) => (z.max == null ? `≥ ${z.min} ${u}` : !z.min ? `≤ ${z.max} ${u}` : `${z.min}–${z.max} ${u}`);
export const curveLabel = (s) => (s < 60 ? s + ' s' : s < 3600 ? s / 60 + ' min' : s / 3600 + ' h');
