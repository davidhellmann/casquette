/**
 * Where the app stores the theme preference (localStorage, "light" | "dark" | "auto"). Plain JS, so
 * Node tooling (scripts/lib/capture.mjs) shares it with src/lib/theme.ts, which re-exports it.
 */
export const THEME_KEY = 'rc_theme';
