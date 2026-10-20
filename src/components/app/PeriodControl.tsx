import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedToggle } from './SegmentedToggle';
import { basisOptions } from './BasisSwitch';
import { PERIODS } from '@/dashboard-period/index.ts';
import { isPeriod, writePeriod } from '@/lib/period-store.ts';
import { usePeriodChoice } from './use-period-choice.ts';
import { t } from '@/i18n/index.ts';

/** Store the period of a select value (always one of PERIODS). */
const choose = (v: string) => { const days = +v; if (isPeriod(days)) writePeriod({ days }); };

/** Period (7 days … all time) and zone basis (power / heart rate) for the page header. */
export function PeriodControl() {
  const period = usePeriodChoice();
  const days = String(period.days);

  return (
    <div className="flex items-center gap-2" data-testid="period-control">
      <SegmentedToggle value={days} onChange={choose} label={t('period.label')} className="hidden lg:flex"
        options={PERIODS.map((d) => ({ value: String(d), label: t(`period.long.${d}`) }))} />
      <Select value={days} onValueChange={choose}>
        <SelectTrigger size="sm" aria-label={t('period.label')} className="w-28 lg:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((d) => <SelectItem key={d} value={String(d)}>{t(`period.long.${d}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <SegmentedToggle value={period.basis} onChange={(v) => writePeriod({ basis: v })} label={t('basis.label')} options={basisOptions({ text: true })} />
    </div>
  );
}
