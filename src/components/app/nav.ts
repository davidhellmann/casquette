import { BASE } from '../../lib/routes.js';
import { Bike, CalendarDays, Gauge, Map, Mountain, Route, Zap, type LucideIcon } from 'lucide-react';

/** Sidebar navigation: one entry per section, grouped. `key` doubles as the i18n key `nav.<key>`. */
export type NavKey = 'dashboard' | 'rides' | 'years' | 'map' | 'segments' | 'performance' | 'gear';
/** Sections with a submenu of their latest/active entries. */
export type NavSubKey = 'rides' | 'years' | 'gear';
export interface NavItem { key: NavKey; path: string; icon: LucideIcon; sub?: NavSubKey }
/** One submenu entry (built in Base.astro): a recent ride, a year or an active bike; `detail` is its second line. */
export interface NavSubEntry { href: string; label: string; detail: string }
export type NavSubmenus = Record<NavSubKey, NavSubEntry[]>;

export const NAV_GROUPS: { key: 'groupTraining' | 'groupExplore'; items: NavItem[] }[] = [
  {
    key: 'groupTraining',
    items: [
      { key: 'dashboard', path: '', icon: Gauge },
      { key: 'rides', path: 'rides', icon: Route, sub: 'rides' },
      { key: 'years', path: 'years', icon: CalendarDays, sub: 'years' },
    ],
  },
  {
    key: 'groupExplore',
    items: [
      { key: 'map', path: 'map', icon: Map },
      { key: 'segments', path: 'segments', icon: Mountain },
      { key: 'performance', path: 'performance', icon: Zap },
      { key: 'gear', path: 'gear', icon: Bike, sub: 'gear' },
    ],
  },
];

/** Site base URL with a trailing slash (Astro `base`). */
export { BASE };
export const navHref = (path: string) => BASE + path;

/** Same page, with or without a trailing slash. */
export const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
