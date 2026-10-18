import { CircleSlash, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';

/** Shown instead of a chart or list without data – never render an empty chart. */
export function EmptyState({ icon: Icon = CircleSlash, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn('flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-md text-center text-sm text-muted-foreground', className)}>
      <Icon className="size-5 opacity-60" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
