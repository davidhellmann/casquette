/**
 * UI strings. Every visible string lives in a language file (src/i18n/<lang>.ts);
 * new language = copy the file, translate it, register it below, set `PUBLIC_LANG=<lang>`.
 * Runs in the browser, during the Astro build and in tests (pure, no I/O).
 */
import en from './en.ts';

/** The shape of a language file; the English one is the reference every translation follows. */
export type Dictionary = typeof en;

/** A plural form, chosen by `params.n` (`Intl.PluralRules` categories; `other` is required). */
interface Plural {
  other: string;
}

/** Dotted paths into a dictionary node: every nested key, but not the forms inside a plural. */
type Paths<T> = T extends string | readonly unknown[] | Plural
  ? never
  : { [K in Extract<keyof T, string | number>]: `${K}` | `${K}.${Paths<T[K]>}` }[Extract<keyof T, string | number>];

/** The dictionary value at a dotted path. */
type At<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? { [K in keyof T]: `${Extract<K, string | number>}` extends Head ? At<T[K], Rest> : never }[keyof T]
  : { [K in keyof T]: `${Extract<K, string | number>}` extends P ? T[K] : never }[keyof T];

/** A key of `t()`: the dotted path of any string, plural, list or group in the language file. */
export type TKey = Paths<Dictionary>;

/** What `t(key)` returns: text for strings and plurals, the list or group itself otherwise. */
export type TValue<K extends string> = At<Dictionary, K> extends infer V ? (V extends Plural ? string : V) : never;

/**
 * A key built at runtime (`string`, or a template like `nav.${string}`) – unlike a literal key, it cannot be
 * checked against the language file. Detected by its record type having no required property.
 */
type IsDynamic<K extends string> = {} extends Record<K, 1> ? true : false;

/**
 * Values for `{name}` placeholders, inserted with `String(value)`; `n` also chooses the plural form.
 * A null or undefined value leaves its placeholder in place.
 */
export type TParams = Readonly<Record<string, unknown>>;

const LANGS: Record<string, Dictionary> = { en };
const env: Record<string, unknown> = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const requested = env.PUBLIC_LANG;
/** The UI language (`PUBLIC_LANG` if a language file exists for it, otherwise English). */
export const LANG: string = typeof requested === 'string' && LANGS[requested] ? requested : 'en';
const dict = LANGS[LANG];

/** Intl locale for numbers and dates (e.g. 'en-GB'). */
export const LOCALE: string = dict.locale;
const plural = new Intl.PluralRules(LOCALE);

// Walks the dictionary by a runtime key; a missing step yields undefined, as in plain JavaScript.
const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), dict);

const isPlural = (v: unknown): v is Record<string, unknown> & Plural =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'other' in v;

/**
 * Text for `key` with `{name}` placeholders filled from `params`.
 * Plural forms (`{ one, other }`) are chosen by `params.n`. Lists/objects (e.g. zone names) are returned unchanged.
 * An unknown key (only possible from untyped callers) returns the key itself.
 */
export function t<K extends TKey>(key: K, params?: TParams): TValue<K>;
/** A runtime-built key: assumed to name a text. Literal keys must exist in the language file. */
export function t<K extends string>(key: K & (IsDynamic<K> extends true ? string : TKey), params?: TParams): string;
export function t(key: string, params: TParams = {}): unknown {
  let v = lookup(key);
  if (v == null) return key;
  if (isPlural(v)) v = v[plural.select(Number(params.n) || 0)] ?? v.other;
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] == null ? m : String(params[k])));
}

/** Document title: "<page> · Casquette"; without a page title just the app name. */
export function pageTitle(title = ''): string {
  const app = t('app.name');
  return title && title !== app ? t('app.pageTitle', { title, app }) : app;
}
