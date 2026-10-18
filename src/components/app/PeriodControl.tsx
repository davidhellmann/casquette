import * as React from 'react';
import { Heart, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedToggle } from './SegmentedToggle';
import { RANGES } from '@/dashboard-period/index.js';
import { PERIOD_EVENT, readPeriod, writePeriod } from '@/lib/period-store.js';
import { t } from '@/i18n/index.js';

type Period = { days: number; basis: 'power' | 'hr' };

/** Period (7 days … all time) and zone basis (power / heart rate) for the page header. */
export function PeriodControl() {
  // Static HTML shows the defaults; the stored choice is read after hydration.
  const [period, setPeriod] = React.useState<Period>({ days: 30, basis: 'power' });
  React.useEffect(() => {
    setPeriod(readPeriod());
    const onChange = (e: Event) => setPeriod((e as CustomEvent<Period>).detail);
    window.addEventListener(PERIOD_EVENT, onChange);
    return () => window.removeEventListener(PERIOD_EVENT, onChange);
  }, []);
  const days = String(period.days);

  return (
    <div className="flex items-center gap-2" data-testid="period-control">
      <SegmentedToggle value={days} onChange={(v) => writePeriod({ days: +v })} label={t('range.label')} className="hidden lg:flex"
        options={RANGES.map((d: number) => ({ value: String(d), label: t(`range.long.${d}`) }))} />
      <Select value={days} onValueChange={(v) => writePeriod({ days: +v })}>
        <SelectTrigger size="sm" aria-label={t('range.label')} className="w-28 lg:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((d: number) => <SelectItem key={d} value={String(d)}>{t(`range.long.${d}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <SegmentedToggle value={period.basis} onChange={(v) => writePeriod({ basis: v })} label={t('range.basis')} options={[
        { value: 'power', ariaLabel: t('range.power'), label: <><Zap /><span className="hidden sm:inline">{t('range.power')}</span></> },
        { value: 'hr', ariaLabel: t('range.hr'), label: <><Heart /><span className="hidden sm:inline">{t('range.hr')}</span></> },
      ]} />
    </div>
  );
}
