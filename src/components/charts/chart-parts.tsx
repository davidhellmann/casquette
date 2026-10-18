import { cn } from 'cn';

/** Shared pieces around the Recharts charts: the series legend and the tooltip body. */

export type LegendKind = 'line' | 'dashed' | 'bar';
export interface LegendItem { label: string; color: string; kind?: LegendKind }

/** Legend above a chart (decorative – the values are in the tooltip and the sr-only summary). */
export function SeriesLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-3 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
      {items.map(({ label, color, kind = 'line' }) => (
        <li key={label} className="flex items-center gap-1.5">
          {kind === 'bar' && <span className="h-2.5 w-2 rounded-[1px]" style={{ background: color }} />}
          {kind === 'line' && <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />}
          {kind === 'dashed' && <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />}
          {label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipLine { label: string; color?: string; value: string }

/** Tooltip body: a title, an optional muted subtitle, one line per series and an optional muted footer. */
export function TooltipBox({ title, subtitle, lines, footer, className }: { title: string; subtitle?: string; lines: TooltipLine[]; footer?: string | null; className?: string }) {
  return (
    <div className={cn('grid min-w-44 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground', className)}>
      <div>
        <div className="font-medium">{title}</div>
        {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
      </div>
      {lines.map((l) => (
        <div key={l.label} className="flex items-center gap-2">
          {l.color && <span className="size-2 rounded-[2px]" style={{ background: l.color }} />}
          <span className="text-muted-foreground">{l.label}</span>
          <span className="ml-auto pl-3 font-mono font-medium tabular-nums">{l.value}</span>
        </div>
      ))}
      {footer && <div className="text-muted-foreground">{footer}</div>}
    </div>
  );
}
