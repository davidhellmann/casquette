import * as React from 'react';
import { PERIOD_EVENT, readPeriod, type PeriodChoice } from '@/lib/period-store.ts';

// Static HTML shows the defaults; the stored choice takes over right after hydration.
const SERVER: PeriodChoice = { days: 30, basis: 'power' };
let snapshot: PeriodChoice = SERVER;

const subscribe = (onChange: () => void) => {
  window.addEventListener(PERIOD_EVENT, onChange);
  return () => window.removeEventListener(PERIOD_EVENT, onChange);
};
/** The stored choice, as the same object while it is unchanged (useSyncExternalStore compares by identity). */
function current(): PeriodChoice {
  const next = readPeriod();
  if (next.days !== snapshot.days || next.basis !== snapshot.basis) snapshot = next;
  return snapshot;
}

/**
 * The stored period and zone basis for the controls that set them. An urgent update, so a control
 * flips on the click; the dashboard behind it re-renders in a transition (`useDashboard`).
 */
export const usePeriodChoice = (): PeriodChoice => React.useSyncExternalStore(subscribe, current, () => SERVER);
