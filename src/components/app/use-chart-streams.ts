import * as React from 'react';
import { chartStreams } from '@/lib/chart-streams.ts';

/**
 * A ride's chart streams, fetched once per page (src/lib/chart-streams.ts).
 * undefined = loading, null = none (no id, no streams or failed to load).
 */
export function useChartStreams(id: string | null): any {
  const [loaded, setLoaded] = React.useState<{ id: string; data: unknown } | null>(null);
  React.useEffect(() => {
    if (!id) return;
    let live = true;
    chartStreams.load(id).then((data: unknown) => { if (live) setLoaded({ id, data }); });
    return () => { live = false; };
  }, [id]);
  if (!id) return null;
  return loaded && loaded.id === id ? loaded.data : undefined;
}
