// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Where the app stores the theme preference (localStorage, "light" | "dark" | "auto"). Plain JS, so
 * Node tooling (scripts/site/lib/capture.ts) shares it with src/lib/theme.ts, which re-exports it.
 */
export const THEME_KEY = 'rc_theme';
