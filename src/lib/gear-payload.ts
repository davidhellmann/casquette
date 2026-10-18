/**
 * Build payloads of the gear pages (/gear, /gear/<id>) from the build dataset: bikes and shoes with
 * their stat ride totals, charts, records and rides. Build time.
 */
import type { GearPayload } from '../components/gear/GearView';
import type { GearDetailPayload, GearRecord } from '../components/gear/GearDetailView';
import type { BuildDataset } from './build-dataset.js';
import { routes } from './routes.js';
import { gearUrl } from './strava-links.js';
import { rideRows } from '../components/rides/ride-list.js';
import { avgOutdoorSpeed, kmPerBikeAndYear, kmPerMonth, kmPerTerrain, kmPerYear } from '../components/gear/gear-data.js';
import { bikeColors } from '../components/charts/categories';
import { bestCurve, calendarDate, calendarDay, records } from '../training/index.js';
import { t } from '../i18n/index.js';

const YEAR_MS = 365 * 86400000;
/** The purchase day as written: a string keeps its written day, a YAML date (UTC midnight) its UTC day; null if invalid. */
function purchaseDate(value: unknown): Date | null {
  const d = value instanceof Date ? new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) : calendarDate(String(value ?? ''));
  return isNaN(+d) ? null : d;
}
const recordValue: Record<GearRecord['key'], (r: any) => number> = { longest: (r) => r.distance, climb: (r) => r.elev, fastest: (r) => r.speed, np: (r) => r.np };

/** /gear: bikes (active first, then by kilometres) and shoes, kilometres per bike and year. */
export function gearIndexPayload(data: BuildDataset): GearPayload {
  const bikes = data.gear.filter((g) => g.type === 'bike');
  const shoes = data.gear.filter((g) => g.type === 'shoe');
  const colorOf = bikeColors(bikes.map((b) => b.id));
  const perYear = kmPerBikeAndYear(bikes);
  return {
    bikes: bikes.map((b) => ({
      id: b.id,
      name: b.name,
      href: routes.gear(b.id),
      sub: [b.frame_type, b.brand, b.model].filter(Boolean).join(' · ') || t('gear.bicycle'),
      primary: !!b.primary,
      retired: !!b.retired,
      km: b.kmTotal,
      rides: b.t.n,
      hours: b.t.h,
      elev: b.t.elev,
      years: kmPerYear(b.rides),
      lastRide: b.last ? calendarDay(b.last.d) : null,
      costPerKm: b.costPerKm,
    })),
    shoes: shoes.map((s) => ({ id: s.id, name: s.name, sub: [s.brand, s.model].filter(Boolean).join(' · '), retired: !!s.retired, km: s.stravaKm })),
    perYear: { bikes: perYear.bikes.map((b) => ({ ...b, color: colorOf[b.id] })), rows: perYear.rows as GearPayload['perYear']['rows'] },
    currentYear: data.calendar.end.getFullYear(),
  };
}

/** /gear/<id>: one bike or pair of shoes. The months run to the calendar end; owned years count to now. */
export function gearPayload(data: BuildDataset, { id }: { id: string }): GearDetailPayload {
  const g = data.gear.find((x) => x.id === String(id));
  if (!g) throw new Error(`No gear ${id}`);
  const rides = g.rides;
  const c = g.custom || {};
  const purchase = purchaseDate(c.purchase_date);
  const curve = bestCurve(rides);
  const recs = records(rides);
  return {
    name: g.name,
    kind: g.frame_type || t(g.type === 'shoe' ? 'gear.shoe' : 'gear.bicycle'),
    brandModel: [g.brand, g.model].filter(Boolean).join(' '),
    retired: !!g.retired,
    primary: !!g.primary,
    weight: g.weight ?? null,
    color: c.color || null,
    stravaUrl: gearUrl(g.id) || null,
    description: g.description || null,
    stats: {
      km: g.t.km, rides: g.t.n, hours: g.t.h, elev: g.t.elev,
      avgSpeed: avgOutdoorSpeed(rides),
      indoorShare: g.t.h ? (g.t.indoorH / g.t.h) * 100 : null,
      kj: g.t.kj, tss: g.t.tss,
      first: g.first ? calendarDay(g.first.d) : null,
      last: g.last ? calendarDay(g.last.d) : null,
    },
    purchase: purchase ? calendarDay(purchase) : null,
    price: c.price_eur ?? null,
    costPerKm: g.costPerKm,
    ownedYears: purchase ? (+data.calendar.now - purchase.getTime()) / YEAR_MS : null,
    components: c.components || [],
    notes: c.notes || null,
    months: kmPerMonth(rides, data.calendar.end),
    years: kmPerYear(rides),
    terrains: kmPerTerrain(rides),
    curve: Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, v.w])),
    curveWkg: data.curveWkg(curve),
    records: (Object.keys(recordValue) as GearRecord['key'][]).map((key) => {
      const r = recs[key];
      return { key, ride: r ? { href: routes.ride(r.id), name: r.name, date: calendarDay(r.d), value: recordValue[key](r) } : null };
    }),
    rides: rideRows(rides),
    currentYear: data.calendar.end.getFullYear(),
  };
}
