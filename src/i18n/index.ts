// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * UI strings. Every visible string lives in a language file (src/i18n/<lang>.js);
 * new language = copy the file, translate it, register it below, set `PUBLIC_LANG=<lang>`.
 * Runs in the browser, during the Astro build and in tests (pure, no I/O).
 */
import en from './en.ts';

const LANGS = { en };
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const LANG = LANGS[env.PUBLIC_LANG] ? env.PUBLIC_LANG : 'en';
const dict = LANGS[LANG];

/** Intl locale for numbers and dates (e.g. 'en-GB'). */
export const LOCALE = dict.locale;
const plural = new Intl.PluralRules(LOCALE);

const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);

/**
 * Text for `key` with `{name}` placeholders filled from `params`.
 * Plural forms (`{ one, other }`) are chosen by `params.n`. Lists/objects (e.g. zone names) are returned unchanged.
 */
export function t(key, params = {}) {
  let v = lookup(key);
  if (v == null) return key;
  if (typeof v === 'object' && !Array.isArray(v) && 'other' in v) v = v[plural.select(Number(params.n) || 0)] ?? v.other;
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] == null ? m : String(params[k])));
}

/** Document title: "<page> · Casquette"; without a page title just the app name. */
export function pageTitle(title = '') {
  const app = t('app.name');
  return title && title !== app ? t('app.pageTitle', { title, app }) : app;
}
