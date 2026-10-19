/** Display: numbers, dates, durations, escaping in the UI locale – runs in the browser and during the Astro build. Domain rules, including calendar-day arithmetic, live in src/training/. */
import { LOCALE } from '../i18n/index.ts';
import { calendarDate } from '../training/index.ts';
const pad = (n: number) => String(n).padStart(2, '0');
/** A number with `dec` decimals in the UI locale; '–' when unknown. */
export const nf = (v: number | null | undefined, dec = 0): string => (v == null || isNaN(v) ? '–' : Number(v).toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
/** Seconds → "1:05 h" / "45 min". */
export const fmtDur = (s: number | null | undefined): string => { const tm = Math.round((s || 0) / 60), h = Math.floor(tm / 60), m = tm % 60; return h ? `${h}:${pad(m)} h` : `${m} min`; };
/** Seconds → "m:ss" / "h:mm:ss"; `hours` always shows the hour ("0:05:12", elapsed time on a ride). */
export const fmtClock = (s: number | null | undefined, hours = false): string => { const sec = Math.round(s || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return h || hours ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
/** Seconds → "h:mm" (time axis ticks). */
export const fmtHm = (s: number | null | undefined): string => `${Math.floor((s || 0) / 3600)}:${pad(Math.floor(((s || 0) % 3600) / 60))}`;
/** Hours → "1.5 h". */
export const fmtH = (h: number | null | undefined): string => nf(h, 1) + ' h';
export const fmtDate = (d: Date): string => d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
export const fmtDateL = (d: Date): string => d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
/** "Mon, 03/06/2024" – `year`: 'numeric', '2-digit' or false (no year). */
export const fmtWeekdayDate = (d: Date, year: 'numeric' | '2-digit' | false = 'numeric'): string => d.toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', ...(year ? { year } : {}) });
/** "Monday, 03 June 2024" (ride headers). */
export const fmtLongDate = (d: Date): string => d.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
/** "3 Jun" or, with `withYear`, "3 Jun 2024". */
export const fmtDayMonth = (d: Date, withYear = false): string => d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
/** Short weekday, e.g. "Sun" (second line of a date cell). */
export const fmtWeekday = (d: Date): string => d.toLocaleDateString(LOCALE, { weekday: 'short' });
/** "June 2024" (tooltips, key figures). */
export const fmtMonthYear = (d: Date): string => d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
/** "Jun 24" (axis ticks). */
export const fmtMonthYearShort = (d: Date): string => d.toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' });
/** "Jun" (calendar month labels). */
export const fmtMonthShort = (d: Date): string => d.toLocaleDateString(LOCALE, { month: 'short' });
/** "14:05" – time of day. */
export const fmtTime = (d: Date): string => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
/** Month key 'YYYY-MM' → local first-of-month date. */
export const monthStart = (key: string): Date => { const [y, m] = key.split('-'); return new Date(+y, +m - 1, 1); };
/** Month key 'YYYY-MM' → "June 2024". */
export const monthLabel = (key: string): string => fmtMonthYear(monthStart(key));
/** Month key 'YYYY-MM' → "Jun 24" (axis ticks). */
export const monthTick = (key: string): string => fmtMonthYearShort(monthStart(key));
/** 'YYYY-MM-DD' (local calendar day) → date in the UI locale. */
export const fmtIso = (s: string | null | undefined): string => fmtDateL(calendarDate(s));
/** Text cut to `n` characters with an ellipsis; '' when missing. */
export const trunc = (s: string | null | undefined, n: number): string => ((s || '').length > n ? (s || '').slice(0, n - 1) + '…' : s || '');
/** Text escaped for HTML; '' for null or undefined. */
export const esc = (s: unknown): string => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
/** A zone's range with its unit: "≥ 180 bpm", "≤ 129 bpm" (Z1 from 0) or "130–149 bpm". */
export const zr = (z: { min?: number | null; max?: number | null }, u: string): string => (z.max == null ? `≥ ${z.min} ${u}` : !z.min ? `≤ ${z.max} ${u}` : `${z.min}–${z.max} ${u}`);
/** Power curve duration in seconds → "5 s", "20 min", "1 h". */
export const curveLabel = (s: number): string => (s < 60 ? s + ' s' : s < 3600 ? s / 60 + ' min' : s / 3600 + ' h');
