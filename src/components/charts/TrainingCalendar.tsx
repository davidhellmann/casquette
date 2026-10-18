import * as React from 'react';
import { cn } from 'cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { t } from '@/i18n/index.ts';

/** One ride of a day with several rides – an entry of the cell's menu. */
export interface CalendarRide {
  href: string;
  name: string;
  /** Muted second line, e.g. "1:10 h · load 60". */
  detail?: string;
}

/** One day of the calendar. */
export interface CalendarDay {
  /** 0 = nothing, 1–4 = load (or distance) step – drives the `--load-*` colour. */
  level: 0 | 1 | 2 | 3 | 4;
  /** The date as shown in the tooltip; also the cell's accessible name. */
  title: string;
  /** Main tooltip line, e.g. "2 rides · 3:10 h · load 140". */
  detail?: string;
  /** Muted tooltip lines: ride names, or "Rest day". */
  notes?: string[];
  /** Click / Enter opens this URL (the day's ride; with several rides the most recent one). */
  href?: string;
  /** Two or more rides on the day: click / Enter opens a menu to choose one instead of following `href`. */
  rides?: CalendarRide[];
  /** Outside the highlighted period – drawn faint. */
  dim?: boolean;
}

export interface TrainingCalendarProps {
  /** Week by week, Monday → Sunday (length = weeks × 7). `null` = no day here (future, other year). */
  days: (CalendarDay | null)[];
  weeks: number;
  /** Month labels above the week where the month starts. */
  months: { week: number; label: string }[];
  /** Seven short weekday names, Monday first. */
  weekdays: string[];
  /** Accessible name of the grid. */
  label: string;
  className?: string;
}

const LEVEL = ['bg-load-0', 'bg-load-1', 'bg-load-2', 'bg-load-3', 'bg-load-4'];
const columns = (weeks: number) => ({ gridTemplateColumns: `1.75rem repeat(${weeks}, minmax(0, 1fr))` });

/**
 * Training calendar (heatmap): one row per weekday, one column per week, colour = level.
 * An ARIA grid with a roving focus – arrow keys move by day/week, Home/End along the row,
 * Enter opens the day's ride – or, on a day with several rides, a menu to choose one. Hover or focus
 * shows the day in a tooltip.
 */
export function TrainingCalendar({ days, weeks, months, weekdays, label, className }: TrainingCalendarProps) {
  const last = days.findLastIndex(Boolean);
  const [focus, setFocus] = React.useState(last);
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);
  // A day's ride menu replaces the tooltip while it is open.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const shown = menuOpen ? null : hover ?? (focused ? focus : null);
  const tipId = React.useId();
  const wrap = React.useRef<HTMLDivElement>(null);
  const tip = React.useRef<HTMLDivElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const cell = (i: number) => wrap.current?.querySelector<HTMLElement>(`[data-day="${i}"]`);

  // Narrow screens scroll the grid: start at the latest weeks.
  React.useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  // Tooltip above the active day, kept inside the calendar's width.
  React.useLayoutEffect(() => {
    const el = shown == null ? null : cell(shown);
    if (!el || !tip.current || !wrap.current) return;
    const box = wrap.current.getBoundingClientRect(), c = el.getBoundingClientRect(), w = tip.current.offsetWidth;
    const x = Math.min(Math.max(c.left + c.width / 2 - box.left, w / 2), box.width - w / 2);
    tip.current.style.left = `${x}px`;
    tip.current.style.top = `${c.top - box.top}px`;
  }, [shown]);

  // Roving focus (APG grid): arrows move by day (up/down) and week (left/right) without wrapping,
  // Home/End to the ends of the row, Ctrl+Home/End to the first/last day.
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys inside a ride menu (rendered in a portal) bubble here through React – they are the menu's.
    if (!e.currentTarget.contains(e.target as Node)) return;
    const row = focus % 7, inRow = (i: number) => i % 7 === row && !!days[i];
    const firstOf = (ok: (i: number) => boolean) => days.findIndex((d, i) => ok(i) && !!d);
    const lastOf = (ok: (i: number) => boolean) => days.findLastIndex((d, i) => ok(i) && !!d);
    const to = {
      ArrowLeft: focus - 7,
      ArrowRight: focus + 7,
      ArrowUp: row > 0 ? focus - 1 : -1,
      ArrowDown: row < 6 ? focus + 1 : -1,
      Home: e.ctrlKey ? firstOf(() => true) : firstOf(inRow),
      End: e.ctrlKey ? lastOf(() => true) : lastOf(inRow),
    }[e.key];
    if (to == null) return;
    e.preventDefault();
    if (!days[to]) return;
    setFocus(to);
    cell(to)?.focus();
  };

  const active = shown != null ? days[shown] : null;
  return (
    <div ref={wrap} className={cn('relative', className)}>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="grid min-w-[720px] gap-[3px]">
          <div className="grid h-4 gap-[3px] font-mono text-[10px] text-muted-foreground" style={columns(weeks)} aria-hidden="true">
            {months.map((m) => (
              <span key={m.week} className="whitespace-nowrap" style={{ gridRow: 1, gridColumn: `${m.week + 2} / span 4` }}>{m.label}</span>
            ))}
          </div>
          <div
            role="grid"
            aria-label={label}
            className="grid gap-[3px]"
            onMouseLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
          >
            {weekdays.map((wd, row) => (
              <div role="row" key={row} className="grid gap-[3px]" style={columns(weeks)}>
                <span role="rowheader" className="sticky left-0 z-10 self-stretch flex items-center bg-card font-mono text-[9.5px] leading-none text-muted-foreground">
                  <span className={row % 2 ? 'sr-only' : undefined}>{wd}</span>
                </span>
                {Array.from({ length: weeks }, (_, w) => {
                  const i = w * 7 + row, day = days[i];
                  if (!day) return <span key={i} aria-hidden="true" />;
                  const own = {
                    'data-day': i,
                    tabIndex: i === focus ? 0 : -1,
                    'aria-label': day.title,
                    'aria-describedby': i === shown ? tipId : undefined,
                    className: cn(
                      'block aspect-square w-full rounded-[3px] outline-offset-1 hover:outline hover:outline-1 hover:outline-foreground/40 focus-visible:outline-2 focus-visible:outline-ring',
                      LEVEL[day.level],
                      day.dim && 'opacity-30',
                    ),
                  };
                  return (
                    <div
                      key={i}
                      role="gridcell"
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => { setFocus(i); setFocused(true); }}
                      {...(day.href || day.rides ? {} : own)}
                    >
                      {day.rides ? (
                        <DropdownMenu onOpenChange={setMenuOpen}>
                          <DropdownMenuTrigger asChild>
                            {/* Arrow keys move through the grid; only Enter / Space / click open the menu. */}
                            <button type="button" {...own} onKeyDown={(e) => { if (e.key.startsWith('Arrow')) e.preventDefault(); }} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-48 max-w-72" aria-labelledby={undefined} aria-label={t('common.ridesOn', { date: day.title })}>
                            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{day.title}</DropdownMenuLabel>
                            {day.rides.map((r) => (
                              <DropdownMenuItem key={r.href} asChild>
                                <a href={r.href} className="flex-col items-start gap-0">
                                  <span className="max-w-full truncate">{r.name}</span>
                                  {r.detail && <span className="text-xs text-muted-foreground">{r.detail}</span>}
                                </a>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        day.href && <a href={day.href} {...own} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {active && (
        <div
          ref={tip}
          role="tooltip"
          className="pointer-events-none absolute z-50 w-max max-w-72 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground"
        >
          <p className="font-medium" aria-hidden="true">{active.title}</p>
          <div id={tipId}>
            {active.detail && <p>{active.detail}</p>}
            {active.notes?.map((n, k) => <p key={k} className="text-muted-foreground">{n}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Summary figures under the calendar (active days, streaks …). */
export function CalendarStats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap" data-testid="calendar-stats">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col-reverse justify-end gap-0.5">
          <dt className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">{s.label}</dt>
          <dd className="text-xl font-medium tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The colour scale: less → more. */
export function CalendarLegend({ less, more }: { less: string; more: string }) {
  return (
    <div className="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground" data-testid="calendar-legend">
      <span className="mr-1">{less}</span>
      {LEVEL.map((c) => <span key={c} className={cn('size-3 rounded-[3px]', c)} aria-hidden="true" />)}
      <span className="ml-1">{more}</span>
    </div>
  );
}
