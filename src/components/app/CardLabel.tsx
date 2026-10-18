import { cn } from 'cn';

/** Card title: small uppercase mono label on a pink-tinted chip (C1, #26). Renders a heading. */
export function CardLabel({ as: Tag = 'h3', className, children }: { as?: 'h2' | 'h3' | 'h4'; className?: string; children: React.ReactNode }) {
  return (
    <Tag className={cn('w-fit rounded-sm bg-brand-surface px-1.5 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-brand-surface-foreground uppercase', className)}>
      {children}
    </Tag>
  );
}
