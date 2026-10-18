import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { t } from '@/i18n/index.js';

/** The year review's place among all years (page header of /years/<year>). */
export interface YearSwitch {
  year: number;
  /** Every year with rides, newest first. */
  years: number[];
  /** Base URL with a trailing slash. */
  base: string;
}

/** Year switch for the page header: older / newer year and a picker for any year. */
export function YearControl({ year, years, base }: YearSwitch) {
  const i = years.indexOf(year);
  const older = years[i + 1], newer = i > 0 ? years[i - 1] : undefined;
  const href = (y: number | string) => `${base}years/${y}`;
  const step = (y: number | undefined, label: string, Icon: typeof ChevronLeft) =>
    y != null ? (
      <Button asChild variant="ghost" size="icon" className="size-8">
        <a href={href(y)} aria-label={`${label} (${y})`}><Icon /></a>
      </Button>
    ) : (
      <Button variant="ghost" size="icon" className="size-8" disabled aria-label={label}><Icon /></Button>
    );
  return (
    <div className="flex items-center gap-1" data-testid="year-control">
      {step(older, t('years.older'), ChevronLeft)}
      <Select value={String(year)} onValueChange={(v) => { location.href = href(v); }}>
        <SelectTrigger size="sm" aria-label={t('years.pick')} className="w-24 font-mono tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={String(y)} className="font-mono tabular-nums">{y}</SelectItem>)}
        </SelectContent>
      </Select>
      {step(newer, t('years.newer'), ChevronRight)}
    </div>
  );
}
