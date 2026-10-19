/**
 * TIZ totals: the time in zones of a set of rides summed per basis, with where it came from.
 * Each ride keeps its own zone boundaries (distribution: zones on the ride date; legacy: unknown or
 * those of the sync day), so a total only has shared boundaries when every ride had the same known
 * ones. Pure, no recomputation from current zones.
 */
import { DEFAULT_ZONES } from '../training/index.ts';
import type { Basis, ZoneSet } from '../training/index.ts';
import type { TizBasis } from './index.ts';

/** Where a ride's TIZ came from (`unknown`: the ride carries no TIZ basis). */
export type TizSource = TizBasis[Basis]['source'] | 'unknown';

/** What `tizTotal` reads of a ride. The TIZ basis may be partial (the dashboard payload sends only the bases with TIZ). */
export interface TizRide {
  /** Power TIZ: seconds per power zone. */
  tizP?: readonly number[] | null;
  /** HR TIZ: seconds per HR zone. */
  tizH?: readonly number[] | null;
  tizBasis?: Partial<TizBasis> | null;
}

/** TIZ total of one basis (GLOSSARY "TIZ total"). */
export interface TizTotal<B extends Basis = Basis> {
  /** Summed seconds per zone (7 power / 5 HR zones). */
  seconds: number[];
  /** Sum of `seconds`. */
  total: number;
  /** Number of rides with TIZ. */
  rides: number;
  /** The TIZ basis of each counted ride (null if unknown). */
  bases: (TizBasis[B] | null)[];
  /** Counted rides per source. */
  sources: Partial<Record<TizSource, number>>;
  /** Rides with legacy TIZ or unknown boundaries. */
  legacyCount: number;
  /** The rides do not share one known set of boundaries. */
  mixed: boolean;
  /** The shared boundaries, null when `mixed`. */
  zones: ZoneSet | null;
  /** Only rides with TIZ computed from a distribution (and at least one). */
  exact: boolean;
}

const BASES: Record<Basis, { field: 'tizP' | 'tizH'; zones: number }> = {
  power: { field: 'tizP', zones: DEFAULT_ZONES.power_zones.length },
  hr: { field: 'tizH', zones: DEFAULT_ZONES.heart_rate_zones.length },
};

/** Final rides + basis ('power' | 'hr') → the TIZ total of that basis. An unknown basis throws. */
export function tizTotal<B extends Basis>(rides: readonly TizRide[], basis: B): TizTotal<B> {
  const base: { field: 'tizP' | 'tizH'; zones: number } | undefined = BASES[basis];
  if (!base) throw new RangeError(`Unknown basis: ${basis}`);
  const { field, zones: count } = base;
  const seconds: number[] = Array(count).fill(0), bases: (TizBasis[B] | null)[] = [];
  for (const r of rides) {
    const tiz = r[field];
    if (tiz) {
      tiz.forEach((v, i) => { if (i < count) seconds[i] += v; });
      bases.push(r.tizBasis?.[basis] ?? null);
    }
  }
  const zones = bases[0]?.zones ?? null, key = JSON.stringify(zones);
  const mixed = bases.some((b) => !b?.zones || JSON.stringify(b.zones) !== key);
  const sources: Partial<Record<TizSource, number>> = {};
  for (const b of bases) { const s: TizSource = b?.source ?? 'unknown'; sources[s] = (sources[s] || 0) + 1; }
  return {
    seconds, total: seconds.reduce((a, b) => a + b, 0), rides: bases.length, bases, sources,
    legacyCount: bases.filter((b) => b?.source === 'legacy' || !b?.zones).length,
    mixed, zones: mixed ? null : zones, exact: bases.length > 0 && bases.every((b) => b?.exact === true),
  };
}
