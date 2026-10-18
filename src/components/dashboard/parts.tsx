import * as React from 'react';
import { SegmentedToggle } from '@/components/app/SegmentedToggle';
import { t } from '@/i18n/index.js';
import { cn } from 'cn';

export type Basis = 'power' | 'hr';

/** A group of cards under a quiet heading with an optional subline. */
export function Section({ title, sub, children, testId }: { title: string; sub?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="grid gap-3 pt-5" data-testid={testId}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
        <h2 id={id} className="text-sm font-medium">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** Power / heart rate switch in a card header. */
export function BasisToggle({ value, onChange, label }: { value: Basis; onChange: (v: Basis) => void; label: string }) {
  return <SegmentedToggle size="sm" value={value} onChange={onChange} label={label} options={[{ value: 'power', label: t('basis.power') }, { value: 'hr', label: t('basis.hr') }]} />;
}

/** Small status word with a dot in its data colour (e.g. "sweet spot"); the text stays ink for contrast. */
export function Status({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('ml-1.5 inline-flex items-center gap-1 font-mono text-[10.5px] font-medium tracking-wide uppercase', className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--${tone})` }} aria-hidden="true" />
      {children}
    </span>
  );
}
