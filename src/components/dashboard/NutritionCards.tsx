import { ChartCard } from '@/components/app/ChartCard';
import { EmptyState } from '@/components/app/EmptyState';
import { RichText } from '@/components/app/RichText';
import { Bar, ZoneLabel } from '@/components/charts/ZoneBars';
import { zoneColor } from '@/components/charts/series';
import { t } from '@/i18n/index.js';
import * as React from 'react';
import { garage, nutrition, zoneTable, zonesSub } from './nutrition-data.js';
import { BasisToggle, type Basis } from './parts';

const n = (key: string) => t('dash.nutrition.' + key);
const rich = '[&_b]:font-medium [&_b]:text-foreground';

/** Daily needs (carbs, protein, fat, water) and what the period's rides burned and needed. */
export function NutritionCard({ D, kg }: { D: any; kg: number }) {
  const N = nutrition(D, kg);
  return (
    <ChartCard title={n('title')} description={<RichText html={N.subHtml} className={rich} />} data-testid="nutrition-card">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {N.macros.map((m) => (
          <div key={m.key} className="rounded-md bg-background px-3 py-2.5">
            <p className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{m.label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        {N.totals.map((x) => (
          <div key={x.key}>
            <dt className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{x.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{x.value} <span className="font-mono text-xs font-normal text-muted-foreground">{x.unit}</span></dd>
            {x.sub && <dd className="text-xs text-muted-foreground">{x.sub}</dd>}
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">{N.disclaimer}</p>
    </ChartCard>
  );
}

/** Today's power or heart-rate zones on one scale; Z2 is the focus zone. */
export function ZonesCard({ zones }: { zones: any }) {
  const [basis, setBasis] = React.useState<Basis>('power');
  const rows = zoneTable(zones, basis);
  return (
    <ChartCard title={t('dash.zonesCard.title')} description={zonesSub(zones, basis)} data-testid="zones-card"
      action={<BasisToggle value={basis} onChange={setBasis} label={t('dash.zonesCard.title')} />}>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.zone} className="grid grid-cols-[2.25rem_minmax(0,1fr)_5.5rem] items-center gap-x-3 text-xs sm:grid-cols-[2.25rem_minmax(0,8rem)_minmax(0,1fr)_5.5rem_7rem]">
            <ZoneLabel zone={r.zone} />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{r.name}</span>
              {r.focus && <span className="rounded-sm bg-brand-surface px-1 font-mono text-[10px] text-brand-surface-foreground uppercase">{t('dash.zonesCard.focus')}</span>}
            </span>
            <span className="hidden sm:block"><Bar from={r.from} width={r.width} color={zoneColor(r.zone)} /></span>
            <span className="text-right font-mono tabular-nums">{r.range}</span>
            <span className="hidden text-right font-mono text-muted-foreground tabular-nums sm:block">{r.ftp}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/** Active bikes by distance, with what was ridden on each in the period. */
export function GarageCard({ D }: { D: any }) {
  const G = garage(D);
  return (
    <ChartCard title={t('dash.garage.title')} description={<RichText html={G.subHtml} className={rich} />} data-testid="garage-card">
      {!G.bikes.length ? <EmptyState>{G.empty}</EmptyState> : (
        <ul className="grid gap-4">
          {G.bikes.map((b) => (
            <li key={b.id} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{b.spec}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm tabular-nums">{b.km}</p>
                  {b.inRange && <p className="text-xs text-muted-foreground">{b.inRange}</p>}
                </div>
              </div>
              <Bar width={b.share} color="var(--brand)" />
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
