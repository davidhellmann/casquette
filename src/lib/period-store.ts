/**
 * The chosen period and zone basis, shared by every page that has the period controls (dashboard,
 * ride log). Stored in localStorage; every change is announced with PERIOD_EVENT.
 */
import { BASES, PERIODS } from '../dashboard-period/index.ts';
import type { PeriodDays } from '../dashboard-period/index.ts';
import type { Basis } from '../training/index.ts';

export const PERIOD_EVENT = 'app:period';
const KEYS = { days: 'rc_days', basis: 'rc_basis' };

/** The stored period and zone basis. */
export interface PeriodChoice {
  days: PeriodDays;
  basis: Basis;
}

const get = (k: string, d: string): string => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k: string, v: string | number) => { try { localStorage.setItem(k, String(v)); } catch {} };

/** A selectable period (days; 0 = all time). */
export const isPeriod = (v: number): v is PeriodDays => (PERIODS as readonly number[]).includes(v);
const isBasis = (v: string): v is Basis => (BASES as readonly string[]).includes(v);

/** Defaults: 30 days, power. */
export function readPeriod(): PeriodChoice {
  const days = +get(KEYS.days, '30'), basis = get(KEYS.basis, 'power');
  return { days: isPeriod(days) ? days : 30, basis: isBasis(basis) ? basis : 'power' };
}

/** Store a change (either field) and announce the full new state. */
export function writePeriod(change: Partial<PeriodChoice>): PeriodChoice {
  const next: PeriodChoice = { ...readPeriod(), ...change };
  put(KEYS.days, next.days);
  put(KEYS.basis, next.basis);
  window.dispatchEvent(new CustomEvent(PERIOD_EVENT, { detail: next }));
  return next;
}
