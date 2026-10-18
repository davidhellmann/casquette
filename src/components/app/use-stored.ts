import * as React from 'react';

/**
 * A UI choice remembered in localStorage. The first render uses `initial` (same as the static HTML),
 * the stored value is applied right after hydration. `key` undefined = not remembered.
 */
export function useStored<V extends string>(key: string | undefined, initial: V, allowed: readonly V[]): [V, (v: V) => void] {
  const [value, setValue] = React.useState<V>(initial);
  React.useEffect(() => {
    if (!key) return;
    try {
      const v = localStorage.getItem(key) as V | null;
      if (v && allowed.includes(v)) setValue(v);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = React.useCallback((v: V) => {
    setValue(v);
    if (key) try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
  }, [key]);
  return [value, set];
}
