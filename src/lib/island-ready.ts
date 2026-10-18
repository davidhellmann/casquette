import { useEffect } from 'react';

/**
 * Readiness signal for the browser tests: every island root (the components a page mounts with
 * `client:load`) calls this once. After its first commit it bumps `<html data-hydrated>`, so
 * `data-hydrated` ≥ the number of `<astro-island>` elements means every island has hydrated and
 * reacts to input. Astro's own `ssr` attribute is removed earlier – React hydrates in a transition.
 */
export function useIslandReady() {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.hydrated = String(Number(html.dataset.hydrated ?? 0) + 1);
  }, []);
}
