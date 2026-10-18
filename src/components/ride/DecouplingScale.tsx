import { cn } from 'cn';
import { DECOUPLING_SCALE } from './ride-presentation.ts';

/** Tick labels under a decoupling bar: 0 %, the stable and drift limits, the end of the scale. Decorative. */
export function DecouplingScale({ className }: { className?: string }) {
  const last = DECOUPLING_SCALE.length - 1;
  return (
    <div className={cn('flex justify-between font-mono text-[10px] text-muted-foreground', className)} aria-hidden="true">
      {DECOUPLING_SCALE.map((v, i) => <span key={v}>{i === 0 ? `${v} %` : i === last ? `${v} %+` : v}</span>)}
    </div>
  );
}
