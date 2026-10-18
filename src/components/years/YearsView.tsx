import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from 'cn';
import { ChartCard } from '@/components/app/ChartCard';
import { EmptyState } from '@/components/app/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { YearsChart } from './YearsChart';
import { useIslandReady } from '@/lib/island-ready';

/** One year on /years (src/lib/year-payload.js). */
export interface YearSummary {
  year: number;
  current: boolean;
  km: number;
  h: number;
  n: number;
  elev: number;
  /** Kilometres vs. the year before in percent; null for the running year or without a year before. */
  delta: number | null;
  /** Kilometres per month, January first. */
  months: number[];
}

export interface YearsPayload {
  base: string;
  /** Newest first. */
  years: YearSummary[];
  rides: number;
  best: { year: number; km: number } | null;
  months: string[];
  monthsLong: string[];
}

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-sm bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums', up ? 'text-positive' : 'text-negative')}>
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">{t(up ? 'years.more' : 'years.less')}</span>
      {nf(Math.abs(pct))} %
    </span>
  );
}

/** A year as a card: total kilometres, rides / hours / elevation, the months as bars and its share of the best year. */
function YearCard({ y, base, maxKm, months }: { y: YearSummary; base: string; maxKm: number; months: string[] }) {
  const mx = Math.max(1, ...y.months);
  return (
    <Card className="gap-4 px-5 transition-colors hover:bg-accent" data-slot="year-card">
      <a href={`${base}years/${y.year}`} className="grid gap-4 rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('font-mono text-3xl font-semibold tracking-tight tabular-nums', y.current && 'text-brand-surface-foreground')}>{y.year}</span>
          {y.current ? <Badge variant="secondary">{t('years.running')}</Badge> : y.delta != null && <Delta pct={y.delta} />}
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {nf(y.km)} <span className="font-mono text-xs font-normal text-muted-foreground">km</span>
        </p>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          {[[nf(y.n), t('metric.rides')], [`${nf(y.h)} h`, t('years.inSaddle')], [nf(y.elev), t('years.elev')]].map(([v, l]) => (
            <div key={l} className="flex flex-col-reverse gap-0.5">
              <dt className="text-muted-foreground">{l}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div aria-hidden="true">
          <div className="flex h-12 items-end gap-[3px]">
            {y.months.map((km, m) => (
              <span key={m} className="flex-1 rounded-t-[2px] bg-brand opacity-80" style={{ height: `${Math.max(4, (km / mx) * 100)}%` }} title={`${months[m]} · ${nf(km)} km`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{months[0]}</span><span>{months[11]}</span></div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand" style={{ width: `${(y.km / maxKm) * 100}%` }} />
        </div>
      </a>
    </Card>
  );
}

/** Years overview (new UI): all years compared, then one card per year. */
export function YearsView({ P }: { P: YearsPayload }) {
  useIslandReady();
  if (!P.years.length) {
    return (
      <Card className="px-6 pb-8" data-testid="years">
        <h1 className="text-lg font-semibold">{t('years.empty')}</h1>
        <EmptyState><span dangerouslySetInnerHTML={{ __html: t('years.emptyHint') }} /></EmptyState>
      </Card>
    );
  }
  const maxKm = Math.max(1, ...P.years.map((y) => y.km));
  return (
    <div className="grid gap-3 pb-8" data-testid="years">
      <h1 className="sr-only">{t('years.title')}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t('years.intro', { years: t('years.introYears', { n: P.years.length }), rides: t('common.rides', { n: nf(P.rides) }) })}
        {P.best && <span dangerouslySetInnerHTML={{ __html: t('years.strongest', { y: P.best.year, km: nf(P.best.km) }) }} />}
      </p>
      {P.years.length > 1 && (
        <div data-testid="years-chart">
          <ChartCard title={t('years.all')} description={t('years.allSub')}>
            <YearsChart years={P.years} base={P.base} />
          </ChartCard>
        </div>
      )}
      <h2 className="sr-only">{t('years.cards')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="year-cards">
        {P.years.map((y) => <YearCard key={y.year} y={y} base={P.base} maxKm={maxKm} months={P.months} />)}
      </div>
    </div>
  );
}
