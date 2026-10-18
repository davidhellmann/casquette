import * as React from 'react';
import { Card } from '@/components/ui/card';
import { CardLabel } from '@/components/app/CardLabel';
import { RichText } from '@/components/app/RichText';
import { t } from '@/i18n/index.js';
import { GoalCards } from './GoalCards';
import { AllTimeCard, CumulativeCard, RecordsSection, YearsCard } from './HistoryCards';
import { PowerHrCard, RhythmCard, TimeInZonesCard, ZoneShareCard, ZoneWeeksCard } from './IntensityCards';
import { GarageCard, NutritionCard, ZonesCard } from './NutritionCards';
import { FuelingMatrixCard } from './FuelingCard';
import { FormCard, LoadCard, PolarizationCard, ProfileCard } from './OverviewCards';
import { EfficiencyCard, PeriodCurveCard } from './ProgressCards';
import { RideAnalysisCard } from './RideAnalysisCard';
import { routes } from '@/lib/routes.js';
import { historySince } from './history-data.js';
import { footer } from './nutrition-data.js';
import { Section, type Basis } from './parts';

const s = (key: string, x?: Record<string, unknown>) => t('dash.sec.' + key, x);

/**
 * Every dashboard card below the fitness chart and the training calendar, for the period (`D`) and
 * zone basis chosen in the page header (#32).
 */
export function DashboardCards({ D, source, basis }: { D: any; source: any; basis: Basis }) {
  const { athleteState } = source.athlete, zones = athleteState.zones, kg = athleteState.weight, base = source.base;
  // The ride in the analysis: the newest of the period until another is picked
  const [picked, setPicked] = React.useState<string | null>(null);
  const selected = D.rides.some((r: any) => r.id === picked) ? picked : D.rides[0]?.id ?? null;
  const cell = selected ? D.fueling[selected]?.cell ?? null : null;
  return (
    <>
      <Section title={s('fitness')} sub={s('fitnessSub')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormCard D={D} />
          <PolarizationCard D={D} zones={zones} />
          <ProfileCard D={D} zones={zones} kg={kg} />
          <LoadCard D={D} />
        </div>
      </Section>
      <GoalCards goals={source.goals} ridesAll={D.ridesAll} now={D.now} />
      <Section title={s('intensity')} sub={s('intensitySub', { basis: s(basis === 'hr' ? 'basisHr' : 'basisPower') })} testId="dash-intensity">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="grid lg:col-span-8"><ZoneWeeksCard D={D} basis={basis} /></div>
          <div className="grid lg:col-span-4"><ZoneShareCard D={D} basis={basis} /></div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <TimeInZonesCard D={D} />
          <RhythmCard D={D} />
        </div>
        <PowerHrCard D={D} zones={zones} base={base} />
      </Section>
      <Section title={s('progress')} sub={s('progressSub')}>
        <div className="grid gap-3 lg:grid-cols-2">
          <EfficiencyCard D={D} basis={basis} base={base} />
          <PeriodCurveCard D={D} zones={zones} kg={kg} />
        </div>
      </Section>
      <Section title={s('analysis')} sub={<RichText html={s('analysisSub', { href: routes.rides() })} />}>
        <RideAnalysisCard D={D} id={selected} onSelect={setPicked} basis={basis} />
      </Section>
      {D.history.multiYear && (
        <Section title={s('history')} sub={historySince(D)}>
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="grid lg:col-span-4"><AllTimeCard D={D} base={base} /></div>
            <div className="grid lg:col-span-8"><YearsCard D={D} /></div>
          </div>
          <CumulativeCard D={D} />
        </Section>
      )}
      <RecordsSection D={D} base={base} allTime={!D.hasPrevious} />
      <Section title={s('nutrition')} sub={s('nutritionSub')}>
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="grid lg:col-span-7"><NutritionCard D={D} kg={kg} /></div>
          <div className="grid lg:col-span-5"><FuelingMatrixCard cell={cell} /></div>
        </div>
      </Section>
      <Section title={s('zonesGear')}>
        <div className="grid gap-3 lg:grid-cols-2">
          <ZonesCard zones={zones} />
          <GarageCard D={D} />
        </div>
      </Section>
    </>
  );
}

/** Rides and streams in the collection and the last sync – the last line of the dashboard. */
export function DashboardFooter({ source }: { source: any }) {
  return (
    <footer className="pt-6 pb-2 text-center font-mono text-[11px] leading-relaxed text-muted-foreground" data-testid="dashboard-footer">
      {footer(source).map((line) => <p key={line}>{line}</p>)}
    </footer>
  );
}

/** No rides yet: the steps to the first sync. */
export function SetupCard() {
  return (
    <Card className="max-w-2xl gap-3 px-5" data-testid="dashboard-setup">
      <CardLabel as="h2">{t('dash.setup.title')}</CardLabel>
      <p className="text-sm text-muted-foreground">{t('dash.setup.sub')}</p>
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm [&_code]:rounded-sm [&_code]:bg-background [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
        {t('dash.setup.steps').map((step: string) => <li key={step}><RichText html={step} /></li>)}
      </ol>
    </Card>
  );
}
