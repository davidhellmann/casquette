// @ts-nocheck – typed in phase B of docs/adr/0004
import { getViteConfig } from 'astro/config';

// include is narrowed so Vitest doesn't also collect tests from .worktrees/.
// getViteConfig lets component tests render .astro files via the Astro container API.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
