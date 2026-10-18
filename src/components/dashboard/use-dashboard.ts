import * as React from 'react';
import { PERIOD_EVENT, readPeriod } from '@/lib/period-store.js';
import { computeDashboard, dashboardSource } from './dashboard-data.js';

type Source = ReturnType<typeof dashboardSource>;
type Period = { days: number; basis: 'power' | 'hr' };

let cached: Source | null = null;
/** The build payload in #dash-data, parsed and hydrated once per page. */
function readSource(): Source {
  if (!cached) cached = dashboardSource(JSON.parse(document.getElementById('dash-data')?.textContent || '{}'));
  return cached;
}

/**
 * The dashboard period for the period chosen in the page header. Client-only: the static HTML shows
 * a skeleton (`null`), because the result depends on today's date and the stored period.
 */
export function useDashboard() {
  const [state, setState] = React.useState<{ source: Source; period: Period } | null>(null);
  React.useEffect(() => {
    setState({ source: readSource(), period: readPeriod() });
    const onChange = (e: Event) => setState((s) => s && { ...s, period: (e as CustomEvent<Period>).detail });
    window.addEventListener(PERIOD_EVENT, onChange);
    return () => window.removeEventListener(PERIOD_EVENT, onChange);
  }, []);
  return React.useMemo(() => {
    if (!state || !state.source.rides.length) return state && { ...state, D: null };
    return { ...state, D: computeDashboard(state.source, { ...state.period, now: new Date() }) };
  }, [state]);
}
