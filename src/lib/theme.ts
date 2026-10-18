/**
 * Light / dark / auto theme. Every choice is stored under THEME_KEY (`rc_theme`, ./theme-key.js) ("light" | "dark" | "auto"); without
 * an entry the app is light – the better theme for reading – and auto follows the system. Applied
 * before paint by the inline script in Base.astro and announced with THEME_EVENT so charts can re-read
 * their colours. The website keeps a key and a default of its own (rc_site_theme, dark).
 */
import { THEME_KEY } from './theme-key.js';

export { THEME_KEY };
export type ThemePreference = 'light' | 'dark' | 'auto';
export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: ThemePreference = 'light';
export const THEME_EVENT = 'app:theme';

const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const resolveTheme = (pref: ThemePreference): Theme => (pref === 'auto' ? systemTheme() : pref);

/** Puts the theme on <html> as the `.dark` class (Tailwind/shadcn dark variant). */
export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (html.classList.contains('dark') === (theme === 'dark')) return;
  html.classList.toggle('dark', theme === 'dark');
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function setThemePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {}
  applyTheme(resolveTheme(pref));
}

/** Follows OS changes while the preference is "auto". Returns an unsubscribe function. */
export function followSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (readThemePreference() === 'auto') applyTheme(systemTheme()); };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
