import * as React from 'react';
import { cn } from 'cn';
import { RichText } from '@/components/app/RichText';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Text with an explaining tooltip (i18n markup) on hover and keyboard focus. */
export function WithTip({ tipHtml, children, className }: { tipHtml?: string; children: React.ReactNode; className?: string }) {
  if (!tipHtml) return <div className={className}>{children}</div>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className={cn('rounded-sm outline-offset-2', className)}>{children}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64"><RichText html={tipHtml} /></TooltipContent>
    </Tooltip>
  );
}

/** Label/value row of a key-figure list – place inside a `<dl>`. Optional explaining tooltip. */
export function Row({ label, children, tipHtml, className }: { label: React.ReactNode; children: React.ReactNode; tipHtml?: string; className?: string }) {
  return (
    <WithTip tipHtml={tipHtml} className={cn('flex items-baseline justify-between gap-3 border-b border-border/70 py-1.5 text-xs last:border-0', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium whitespace-nowrap tabular-nums">{children}</dd>
    </WithTip>
  );
}

/** A number with a small label under it (and an optional context line). `compact` for dense card rows. */
export function Figure({ value, label, sub, compact = false, className }: { value: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className={compact ? 'text-sm font-medium tabular-nums' : 'text-xl font-semibold tracking-tight tabular-nums'}>{value}</p>
      <p className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
