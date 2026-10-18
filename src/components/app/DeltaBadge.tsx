import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { nf } from '@/scripts/format.ts';
import { cn } from 'cn';

/**
 * Change in percent. Up = positive colour, down = negative colour; `neutral` (e.g. heart rate,
 * where up is neither good nor bad) and changes below 0.5 % stay grey. `null` = no comparison.
 * `label` replaces the default "12 %" text (e.g. "15 % vs. last year").
 */
export function DeltaBadge({ pct, tip, neutral = false, decimals = 0, label }: { pct: number | null; tip: string; neutral?: boolean; decimals?: number; label?: string }) {
  const dir = pct == null || Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  const tone = neutral || dir === 'flat' ? 'text-muted-foreground' : dir === 'up' ? 'text-positive' : 'text-negative';
  const Icon = pct == null ? Minus : pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-slot="delta" className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-sm whitespace-nowrap bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums', tone)}>
          <Icon className="size-3" aria-hidden="true" />
          {pct == null ? '–' : label ?? `${nf(Math.abs(pct), decimals)} %`}
          <span className="sr-only">{tip}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
