import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { t } from '@/i18n/index.ts';
import { routes } from '@/lib/routes.ts';

/** The year review's place among all years (page header of /years/<year>). */
export interface YearSwitch {
  year: number;
  /** Every year with rides, newest first. */
  years: number[];
}

/** Year switch for the page header: older / newer year and a picker for any year. */
export function YearControl({ year, years }: YearSwitch) {
  const i = years.indexOf(year);
  const older = years[i + 1], newer = i > 0 ? years[i - 1] : undefined;
  const step = (y: number | undefined, label: string, Icon: typeof ChevronLeft) =>
    y != null ? (
      <Button asChild variant="ghost" size="icon" className="size-8">
        <a href={routes.year(y)} aria-label={`${label} (${y})`}><Icon /></a>
      </Button>
    ) : (
      <Button variant="ghost" size="icon" className="size-8" disabled aria-label={label}><Icon /></Button>
    );
  return (
    <div className="flex items-center gap-1" data-testid="year-control">
      {step(older, t('years.older'), ChevronLeft)}
      <Select value={String(year)} onValueChange={(v) => { location.href = routes.year(v); }}>
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
