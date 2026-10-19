/**
 * Nutrition, zones and garage of the dashboard: daily needs and on-bike totals for the period,
 * today's power/HR zones and the bikes. Pure. *Html = i18n strings with markup.
 * The fueling matrix lives in fueling-data.js.
 */
import { nf, zr } from '../../scripts/format.ts';
import { HR_ZONE_NAMES, POWER_ZONE_NAMES } from '../../training/index.ts';
import type { AthleteZones, Basis, Range } from '../../training/index.ts';
import { LOCALE, t } from '../../i18n/index.ts';
import type { TParams } from '../../i18n/index.ts';
import type { DashboardSource, DecodedPeriod } from '../../lib/dashboard-payload.ts';

const n = (key: string, x?: TParams) => t('dash.nutrition.' + key, x);

/** Daily needs for the athlete's weight at the period's load, and what the rides burned and needed. */
export function nutrition(D: DecodedPeriod, kg: number | null | undefined) {
  const S = D.S, { dailyHours, fuel, fluid } = D.nutrition, { category, perKg, amounts } = D.dailyNeeds;
  const range = (r: Range | undefined, f: (v: number) => string | number) => (r ? `${f(r[0])}–${f(r[1])}` : '–');
  return {
    subHtml: n('sub', { kg, cat: n('category.' + category), min: nf(dailyHours * 60) }),
    macros: [
      { key: 'carbs', label: n('carbs'), value: `${range(amounts?.carbs, Math.round)} g`, sub: `${range(perKg.carbs, String)} g/kg` },
      { key: 'protein', label: n('protein'), value: `${range(amounts?.protein, Math.round)} g`, sub: `${range(perKg.protein, (v) => nf(v, 1))} g/kg` },
      { key: 'fat', label: n('fat'), value: `${range(amounts?.fat, Math.round)} g`, sub: `${range(perKg.fat, (v) => nf(v, 1))} g/kg` },
      { key: 'water', label: n('water'), value: `${range(amounts?.water, (v) => nf(v, 1))} l`, sub: n('waterSub') },
    ],
    totals: [
      { key: 'kcal', label: n('burned'), value: nf(S.kcal), unit: 'kcal' },
      { key: 'carbs', label: n('carbsOnBike'), value: nf(fuel), unit: 'g', sub: n('gels', { n: nf(fuel / 25) }) },
      { key: 'fluid', label: n('fluid'), value: nf(fluid, 1), unit: 'l', sub: n('fluidSub') },
      { key: 'kaiserschmarrn', label: n('kaiserschmarrn'), value: nf(S.kcal / 650), unit: '×', sub: n('kaiserschmarrnSub') },
    ],
    disclaimer: n('disclaimer'),
  };
}

/** Today's power or HR zones as ranges on one scale; Z2 is the focus zone. */
export function zoneTable(zones: Pick<AthleteZones, 'ftp' | 'power_zones' | 'heart_rate_zones'>, basis: Basis) {
  const isP = basis !== 'hr', zs = isP ? zones.power_zones : zones.heart_rate_zones;
  const names: readonly string[] = isP ? POWER_ZONE_NAMES : HR_ZONE_NAMES;
  const top = (zs[zs.length - 1].min || 1) * (isP ? 1.25 : 1.08), pct = (v: number) => Math.round((v / zones.ftp) * 100);
  return zs.map((z, i) => {
    const lo = z.min || 0, hi = z.max != null ? z.max : top;
    return {
      zone: i + 1, name: names[i] || '', focus: i === 1, range: zr(z, isP ? 'W' : 'bpm'),
      from: (lo / top) * 100, width: ((hi - lo) / top) * 100,
      ftp: isP ? (z.max != null ? `${pct(lo)}–${pct(z.max)} % FTP` : `> ${pct(lo)} % FTP`) : '',
    };
  });
}

/** Subline of the zones card: where the zones of the basis come from (zones file, Strava or default). */
export const zonesSub = (zones: Pick<AthleteZones, 'ftp'> & { source?: Partial<AthleteZones['source']> | null }, basis: Basis): string => (basis === 'hr'
  ? t('dash.zonesCard.hrSource.' + (zones.source?.hr ?? 'default'))
  : t('dash.zonesCard.powerSub', { ftp: zones.ftp, src: t('dash.zonesCard.powerSource.' + (zones.source?.power ?? 'default')) }));

/** Active bikes by distance, with the distance ridden in the period. */
export function garage(D: DecodedPeriod) {
  const { active, retired, total, max } = D.garage, g = (key: string, x?: TParams) => t('dash.garage.' + key, x);
  return {
    subHtml: g('sub', { active: active.length, retired: retired.length, km: nf(total / 1000) }),
    bikes: active.map((b) => ({
      id: b.id, name: b.name || g('bike'),
      spec: [b.frame_type, b.brand, b.model].filter(Boolean).join(' · ') + (b.weight ? ` · ${nf(b.weight, 1)} kg` : ''),
      km: `${nf(b.statsDistance / 1000)} km`, inPeriod: D.gearKm[b.id] ? g('inPeriod', { km: nf(D.gearKm[b.id]) }) : null,
      share: (b.statsDistance / max) * 100,
    })),
    empty: g('empty'),
  };
}

/** Footer line: rides and streams in the collection, sync state, last sync. */
export function footer(source: Pick<DashboardSource, 'athlete' | 'rides' | 'streamsCount'>): string[] {
  const ath = source.athlete;
  return [
    t('dash.footer', { rides: t('common.rides', { n: nf(source.rides.length) }), streams: nf(source.streamsCount || 0) }) + (ath.sync && !ath.sync.list_complete ? t('dash.footerSyncing') : ''),
    t('dash.lastSync', { d: ath.synced_at ? new Date(ath.synced_at).toLocaleString(LOCALE) : '–' }),
  ];
}
