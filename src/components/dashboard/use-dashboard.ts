import * as React from 'react';
import { PERIOD_EVENT, readPeriod } from '@/lib/period-store.ts';
import type { PeriodChoice } from '@/lib/period-store.ts';
import { decodeDashboard } from '@/lib/dashboard-payload.ts';
import type { DashboardSource } from '@/lib/dashboard-payload.ts';
import { dashboardPeriod } from '@/dashboard-period/index.ts';

type Source = DashboardSource;
type Period = PeriodChoice;

let cached: Source | null = null;
/** The build payload in #dash-data (src/lib/dashboard-payload.ts), decoded once per page. */
function readSource(): Source {
  if (!cached) cached = decodeDashboard(document.getElementById('dash-data')?.textContent || '{}');
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
    const { source, period } = state;
    const D = dashboardPeriod(source.rides, { ...period, now: new Date(), gear: source.athlete.gear || [], athleteState: source.athlete.athleteState });
    return { ...state, D };
  }, [state]);
}
