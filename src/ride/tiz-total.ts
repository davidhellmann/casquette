// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * TIZ totals: the time in zones of a set of rides summed per basis, with where it came from.
 * Each ride keeps its own zone boundaries (distribution: zones on the ride date; legacy: unknown or
 * those of the sync day), so a total only has shared boundaries when every ride had the same known
 * ones. Pure, no recomputation from current zones.
 */
import { DEFAULT_ZONES } from '../training/index.ts';

const BASES = {
  power: { field: 'tizP', zones: DEFAULT_ZONES.power_zones.length },
  hr: { field: 'tizH', zones: DEFAULT_ZONES.heart_rate_zones.length },
};

/**
 * Final rides + basis ('power' | 'hr') → `{ seconds, total, rides, bases, sources, legacyCount, mixed, zones, exact }`.
 * - `seconds`: summed seconds per zone (7 power / 5 HR zones), `total` their sum, `rides` how many rides had TIZ.
 * - `bases`: the `tizBasis` of each counted ride (null if unknown), `sources`: rides per source
 *   (`distribution`, `legacy`, `sync`, …), `legacyCount`: rides with legacy TIZ or unknown boundaries.
 * - `mixed`: the rides do not share one known set of boundaries; `zones`: the shared boundaries, else null.
 * - `exact`: only rides with TIZ computed from a distribution (and at least one).
 */
export function tizTotal(rides, basis) {
  const { field, zones: count } = BASES[basis] ?? {};
  if (!field) throw new RangeError(`Unknown basis: ${basis}`);
  const seconds = Array(count).fill(0), bases = [];
  for (const r of rides) if (r[field]) {
    r[field].forEach((v, i) => { if (i < count) seconds[i] += v; });
    bases.push(r.tizBasis?.[basis] ?? null);
  }
  const zones = bases[0]?.zones ?? null, key = JSON.stringify(zones);
  const mixed = bases.some((b) => !b?.zones || JSON.stringify(b.zones) !== key);
  const sources = {};
  for (const b of bases) { const s = b?.source ?? 'unknown'; sources[s] = (sources[s] || 0) + 1; }
  return {
    seconds, total: seconds.reduce((a, b) => a + b, 0), rides: bases.length, bases, sources,
    legacyCount: bases.filter((b) => b?.source === 'legacy' || !b?.zones).length,
    mixed, zones: mixed ? null : zones, exact: bases.length > 0 && bases.every((b) => b?.exact === true),
  };
}
