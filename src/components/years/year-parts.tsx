import { Bike, CalendarDays, Clock, Flame, Gauge, Mountain, Route, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/app/EmptyState';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

export interface GlanceItem { label: string; value: string; sub?: string }
export interface YearBike { href: string; name: string; km: number; n: number }
export interface Highlight { key: string; label: string; value: string; ride: { href: string; name: string } | null }

/** The year at a glance: label – value pairs. */
export function Glance({ items }: { items: GlanceItem[] }) {
  return (
    <dl className="grid divide-y text-sm" data-testid="glance">
      {items.map((x) => (
        <div key={x.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{x.label}</dt>
          <dd className="text-right font-medium tabular-nums">
            {x.value}
            {x.sub && <span className="block text-xs font-normal text-muted-foreground">{x.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Bikes ridden this year, most kilometres first. */
export function Bikes({ bikes }: { bikes: YearBike[] }) {
  if (!bikes.length) return <EmptyState icon={Bike}>{t('year.noBikes')}</EmptyState>;
  const max = bikes[0].km || 1;
  return (
    <ul className="grid gap-1" data-testid="year-bikes">
      {bikes.map((b) => (
        <li key={b.href}>
          <a href={b.href} className="grid gap-1.5 rounded-md px-2 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{b.name}</span>
              <span className="shrink-0 font-mono tabular-nums">{nf(b.km)} km</span>
            </span>
            <span className="text-xs text-muted-foreground">{t('common.rides', { n: b.n })}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${(b.km / max) * 100}%` }} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const HL_ICON: Record<string, LucideIcon> = { longest: Route, climb: Mountain, fastest: Gauge, np: Zap, hardest: Flame, prs: Trophy, earliest: Clock, last: CalendarDays };

/** The year's best rides: longest, most climbing, fastest … each a link to its ride. */
export function Highlights({ items }: { items: Highlight[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="highlights">
      {items.map((h) => {
        const Icon = HL_ICON[h.key] ?? Trophy;
        const body = (
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-surface text-brand-surface-foreground"><Icon className="size-4" aria-hidden="true" /></span>
            <span className="grid min-w-0 gap-0.5">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{h.label}</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums">{h.value}</span>
              {h.ride && <span className="truncate text-xs text-muted-foreground">{h.ride.name}</span>}
            </span>
          </>
        );
        return (
          <li key={h.key} className="grid">
            <Card className="py-0 transition-colors has-[a:hover]:bg-accent">
              {h.ride
                ? <a href={h.ride.href} className="flex items-center gap-3 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-ring">{body}</a>
                : <div className="flex items-center gap-3 p-4">{body}</div>}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
