import * as React from 'react';
import { cn } from 'cn';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface SegmentedOption<V extends string> {
  value: V;
  label: React.ReactNode;
  /** Accessible name when the label is an icon or hidden on small screens. */
  ariaLabel?: string;
}

// Segmented look: a quiet track, the chosen item inverted (ink on light, light on navy)
const TRACK = { default: 'rounded-md bg-muted p-0.5', sm: 'rounded-md bg-background p-0.5' };
const ITEM = {
  default: 'h-7 rounded-sm! border-0 px-2.5 text-xs',
  sm: 'h-6 rounded-sm! border-0 px-2 text-[11px]',
};
const ITEM_STATE = 'cursor-pointer text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

/**
 * Single choice among a few options as a segmented control (shadcn ToggleGroup). `size="sm"` for
 * card headers (one size smaller, track on the card fill); the default for page headers and toolbars.
 */
export function SegmentedToggle<V extends string>({ value, onChange, options, label, title, size = 'default', disabled = false, className }: {
  value: V;
  onChange: (v: V) => void;
  options: SegmentedOption<V>[];
  /** Accessible name of the group. */
  label: string;
  /** Hover hint for the whole group. */
  title?: string;
  size?: 'default' | 'sm';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup type="single" disabled={disabled} value={value} onValueChange={(v) => v && onChange(v as V)} aria-label={label} title={title} className={cn(TRACK[size], className)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} aria-label={o.ariaLabel} className={cn(ITEM[size], ITEM_STATE)}>{o.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
