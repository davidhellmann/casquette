import { Heart, Zap } from 'lucide-react';
import { SegmentedToggle, type SegmentedOption } from './SegmentedToggle';
import { writePeriod } from '@/lib/period-store.ts';
import { usePeriodChoice } from './use-period-choice.ts';
import { t } from '@/i18n/index.ts';
import type { Basis } from '@/training/index.ts';

/** Power / HR with their icons; `text` adds the word from `sm` up (the icon alone is enough below). */
export const basisOptions = ({ text }: { text: boolean }): SegmentedOption<Basis>[] => [
  { value: 'power', ariaLabel: t('basis.power'), label: <><Zap />{text && <span className="hidden sm:inline">{t('basis.power')}</span>}</> },
  { value: 'hr', ariaLabel: t('basis.hr'), label: <><Heart />{text && <span className="hidden sm:inline">{t('basis.hr')}</span>}</> },
];

/**
 * The page's zone basis (the header switch) repeated in the header of every card that follows it –
 * icons only, all in sync; its hover hint says it applies to the whole page.
 */
export function BasisSwitch() {
  const { basis } = usePeriodChoice();
  return <SegmentedToggle size="sm" value={basis} onChange={(v) => writePeriod({ basis: v })} label={t('basis.pageWide')} title={t('basis.pageWide')} options={basisOptions({ text: false })} />;
}
