// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * The chosen period and zone basis, shared by every page that has the period controls (dashboard,
 * ride log). Stored in localStorage; every change is announced with PERIOD_EVENT.
 */
import { BASES, PERIODS } from '../dashboard-period/index.ts';

export const PERIOD_EVENT = 'app:period';
const KEYS = { days: 'rc_days', basis: 'rc_basis' };

const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };

/** @returns {{ days: number, basis: 'power' | 'hr' }} – defaults: 30 days, power */
export function readPeriod() {
  let days = +get(KEYS.days, '30'), basis = get(KEYS.basis, 'power');
  if (!PERIODS.includes(days)) days = 30;
  if (!BASES.includes(basis)) basis = 'power';
  return { days, basis };
}

/** Store a change (either field) and announce the full new state. */
export function writePeriod(change) {
  const next = { ...readPeriod(), ...change };
  put(KEYS.days, next.days);
  put(KEYS.basis, next.basis);
  window.dispatchEvent(new CustomEvent(PERIOD_EVENT, { detail: next }));
  return next;
}
