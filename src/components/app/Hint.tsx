import { Lightbulb } from 'lucide-react';
import { cn } from 'cn';
import { RichText } from './RichText';

/** Coaching hint: a quiet inline note under a card's content – muted text, no colour, no box. */
export function Hint({ html, className }: { html: string; className?: string }) {
  return (
    <p data-slot="hint" className={cn('flex gap-2 text-xs leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground', className)}>
      <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <RichText html={html} />
    </p>
  );
}
