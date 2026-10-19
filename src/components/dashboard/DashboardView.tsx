import * as React from 'react';
import { CircleCheck, Clock } from 'lucide-react';
import { ChartCard } from '@/components/app/ChartCard';
import { DeltaBadge } from '@/components/app/DeltaBadge';
import { KpiCard, type KpiCardProps } from '@/components/app/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fmtDateL, nf } from '@/scripts/format.ts';
import { t } from '@/i18n/index.ts';
import { CalendarCard } from './CalendarCard';
import { DashboardCards, DashboardFooter, SetupCard } from './DashboardCards';
import { FitnessChart } from './FitnessChart';
import { RecentRides } from './RecentRides';
import { useDashboard } from './use-dashboard';
import { useIslandReady } from '@/lib/island-ready';
import type { DashboardAthlete, DecodedPeriod } from '@/lib/dashboard-payload.ts';
import type { AthleteState } from '@/training/index.ts';

const k = (key: string, p?: Record<string, unknown>) => t(`dash.kpi.${key}`, p);

function kpis(D: DecodedPeriod, athleteState: AthleteState): KpiCardProps[] {
  const S = D.S;
  const delta = (pct: number | null, tip = t('dash.vsPrev'), neutral = false) =>
    <DeltaBadge pct={pct} tip={pct == null ? t(D.hasPrevious ? 'dash.noDelta' : 'dash.noDeltaAll') : tip} neutral={neutral} />;
  const half = t('dash.halfDelta');
  const hz = athleteState.zones.heart_rate_zones[1];
  const hours = S.time / 3600;
  return [
    { label: k('rides'), value: S.n, delta: delta(S.deltas.n), secondary: D.hasPrevious ? k('prev', { v: S.nP }) : k('since', { d: fmtDateL(D.oldest) }), spark: D.sparks.n, series: 'rides', fromZero: true },
    { label: k('time'), value: hours, decimals: hours > 999 ? 0 : 1, unit: 'h', delta: delta(S.deltas.time), secondary: k('perWeek', { v: nf(S.hoursPerWeek, 1) }), spark: D.sparks.time, series: 'time', fromZero: true },
    { label: k('distance'), value: S.dist / 1000, unit: 'km', delta: delta(S.deltas.dist), secondary: k('perRide', { v: nf(S.kmPerRide, 0) }), spark: D.sparks.dist, series: 'distance', fromZero: true },
    { label: k('elevation'), value: S.elev, unit: t('units.elev'), delta: delta(S.deltas.elev), secondary: S.elev > 8849 ? t('common.everest', { n: nf(S.elev / 8849, 1) }) : k('prevElev', { v: nf(S.elevP) }), spark: D.sparks.elev, series: 'elevation', fromZero: true },
    { label: k('power'), value: S.avgW, unit: 'W', delta: delta(S.deltas.power, half), secondary: S.avgW != null ? k('powerSub', { v: nf(S.avgWkg, 2) }) : k('noPower'), spark: D.sparks.power, series: 'power' },
    { label: k('hr'), value: S.avgHR, unit: 'bpm', delta: delta(S.deltas.hr, half, true), secondary: k('hrSub', { min: hz.min, max: hz.max }), spark: D.sparks.hr, series: 'heartRate' },
    { label: k('load'), value: S.tss, unit: 'TSS', delta: delta(S.deltas.tss), secondary: k('loadSub', { v: nf(S.tssPerWeek) }), spark: D.sparks.tss, series: 'load', fromZero: true },
    { label: k('prs'), value: S.pr, delta: delta(S.deltas.pr), secondary: k('prsSub', { v: nf(S.ach) }), spark: D.sparks.pr, series: 'prs', fromZero: true },
  ];
}

/** Sync freshness and today's FTP / weight / W/kg. */
function AthleteLine({ athlete, athleteState }: { athlete: DashboardAthlete; athleteState: AthleteState }) {
  const synced = athlete.synced_at ? new Date(athlete.synced_at) : null;
  const ago = synced ? Math.round((Date.now() - +synced) / 86400000) : null;
  const fresh = ago != null && ago <= 8;
  const { zones, weight } = athleteState;
  const Icon = fresh ? CircleCheck : Clock;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="athlete-line">
      <span className="inline-flex items-center gap-1.5">
        <Icon className={fresh ? 'size-3.5 text-positive' : 'size-3.5 text-warning'} aria-hidden="true" />
        {synced ? (ago === 0 ? t('dash.syncToday') : t('dash.syncAgo', { n: ago })) : t('dash.syncNever')}
      </span>
      <span className="font-mono">{t('dash.athlete', { ftp: nf(zones.ftp), kg: nf(weight, 1), wkg: nf(zones.ftp / weight, 2) })}</span>
    </p>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
      </div>
      <Skeleton className="h-[380px] rounded-lg" />
    </div>
  );
}

/** Dashboard: key figures, fitness, training calendar and every card for the period chosen in the page header. */
export function DashboardView() {
  useIslandReady();
  return (
    <>
      <h1 className="sr-only">{t('nav.dashboard')}</h1>
      <DashboardContent />
    </>
  );
}

function DashboardContent() {
  const data = useDashboard();
  if (!data) return <DashboardSkeleton />;
  const { D, source } = data;
  // The build always sends today's athlete state with the rides
  const athleteState = source.athlete.athleteState;
  if (!D || !athleteState) return <SetupCard />;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-3" data-testid="dashboard">
        <AthleteLine athlete={source.athlete} athleteState={athleteState} />
        <h2 className="sr-only">{t('dash.sec.overview')}</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="kpis">
          {kpis(D, athleteState).map((x) => <KpiCard key={x.series} {...x} />)}
        </div>
        <ChartCard title={t('dash.card.pmc')} description={t('dash.card.pmcSub')}>
          <FitnessChart D={D} />
        </ChartCard>
        <CalendarCard D={D} />
        <DashboardCards D={D} source={source} athleteState={athleteState} basis={data.period.basis} />
        <RecentRides D={D} basis={data.period.basis} />
        <DashboardFooter source={source} />
      </div>
    </TooltipProvider>
  );
}
