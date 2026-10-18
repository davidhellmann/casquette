import { cn } from 'cn';
import { fmtIso, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';

/** PR rank at the time of the ride (1–3); rank 1 highlighted. */
export function PrRank({ rank }: { rank: number | null | undefined }) {
  if (!rank) return null;
  return (
    <span
      className={cn('inline-grid min-w-5 place-items-center rounded-sm px-1 font-mono text-[11px] font-semibold', rank === 1 ? 'bg-brand-surface text-brand-surface-foreground' : 'bg-muted text-muted-foreground')}
      title={t('segments.prRank', { n: rank })}
    >
      {rank}
    </span>
  );
}

/** "Best" badge for an attempt at (within 0.05 % of) the best time, otherwise "+x.x %". */
export function DeltaToBest({ pct }: { pct: number | undefined }) {
  if (pct == null) return <>–</>;
  if (pct < 0.05) return <span className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-positive">{t('segments.best')}</span>;
  return <>{`+${nf(pct, 1)} %`}</>;
}

/** 'YYYY-MM-DD' → localized date, undefined → "–". */
export const isoDate = (d: string | undefined) => (d ? fmtIso(d) : '–');
