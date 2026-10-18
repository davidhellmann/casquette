import { ChartCard } from '@/components/app/ChartCard';
import { KpiCard, type KpiCardProps } from '@/components/app/KpiCard';
import { fmtIso, monthLabel, nf } from '@/scripts/format.js';
import { t } from '@/i18n/index.js';
import { FtpChart } from './FtpChart';
import { WkgChart } from './WkgChart';
import { LongTermFitnessChart } from './LongTermFitnessChart';
import { PowerCurveChart } from './PowerCurveChart';
import { FtpHistoryTable, PowerProfileTable, type HistoryEntry, type ProfileYear } from './PerformanceTables';
import { useIslandReady } from '@/lib/island-ready';

/** One month of the performance series (build payload). */
export interface PerformanceMonth { key: string; eftp: number | null; best20: number | null; ftp: number | null; weight: number | null; wkg: number | null }

type Curves = Record<'all' | 'd90' | 'ly', Record<string, number | null>>;

/** Build payload of /performance (src/pages/performance.astro). */
export interface PerformancePayload {
  /** Today's FTP and body weight. */
  ftp: number;
  kg: number;
  current: { eftp: number; wkg: number } | null;
  peak: { key: string; eftp: number; wkg: number } | null;
  peakCtl: { date: string; ctl: number } | null;
  /** All-time bests for the key figures (5 s … 20 min). */
  bests: { label: string; w: number | null; wkg: number | null }[];
  months: PerformanceMonth[];
  ctl: { date: string; ctl: number; atl: number }[];
  curves: Curves;
  curveWkg: Curves;
  lastYear: number;
  /** Newest first. */
  history: HistoryEntry[];
  profile: ProfileYear[];
  durations: string[];
  years: number;
  rides: number;
}

function kpis(P: PerformancePayload): (KpiCardProps & { key: string })[] {
  const { ftp, kg, current, peak, peakCtl } = P;
  const verdict = (eftp: number) => t(eftp > ftp * 1.03 ? 'perf.testWorth' : eftp < ftp * 0.9 ? 'perf.noTest' : 'perf.fits');
  return [
    { key: 'ftp', label: t('perf.ftpStrava'), value: ftp, unit: 'W', secondary: t('perf.ftpSub', { wkg: nf(ftp / kg, 2), kg: nf(kg, 1) }), spark: P.months.map((m) => m.ftp), series: 'ftp' },
    { key: 'eftp', label: t('perf.eftp90'), value: current?.eftp ?? null, unit: 'W', secondary: current ? `${nf(current.wkg, 2)} W/kg · ${verdict(current.eftp)}` : t('perf.noPower'), spark: P.months.map((m) => m.eftp), series: 'eftp' },
    { key: 'peak', label: t('perf.peakEftp'), value: peak?.eftp ?? null, unit: 'W', secondary: peak ? `${monthLabel(peak.key)} · ${nf(peak.wkg, 2)} W/kg` : t('perf.noPower'), series: 'eftp' },
    { key: 'ctl', label: t('perf.peakCtl'), value: peakCtl ? Math.round(peakCtl.ctl) : null, secondary: peakCtl ? t('perf.on', { d: fmtIso(peakCtl.date) }) : t('perf.chart.noData'), spark: P.ctl.map((x) => x.ctl), series: 'fitness', fromZero: true },
    ...P.bests.map((b): KpiCardProps & { key: string } => ({
      key: b.label, label: t('perf.bestDur', { l: b.label }), value: b.w, unit: 'W',
      secondary: b.w != null ? t('perf.wkgAtDate', { v: nf(b.wkg, 2) }) : t('perf.noPower'), series: 'power',
    })),
  ];
}

/** Performance (new UI): FTP history, estimated FTP, W/kg, long-term fitness and the power profile. */
export function PerformanceView({ P }: { P: PerformancePayload }) {
  useIslandReady();
  return (
    <div className="grid gap-3 pb-8" data-testid="performance">
      <h1 className="sr-only">{t('perf.title')}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t('perf.intro', { years: P.years, rides: t('common.rides', { n: nf(P.rides) }) })}
      </p>
      <h2 className="sr-only">{t('perf.keyFigures')}</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="performance-kpis">
        {kpis(P).map(({ key, ...x }) => <KpiCard key={key} {...x} />)}
      </div>
      <div data-testid="ftp-chart">
        <ChartCard title={t('perf.eftpCard')} description={t('perf.eftpSub')}>
          <FtpChart months={P.months} current={P.current} />
        </ChartCard>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div data-testid="wkg-chart" className="grid">
          <ChartCard title={t('perf.wkgCard')} description={t('perf.wkgSub')}>
            <WkgChart months={P.months} />
          </ChartCard>
        </div>
        <div data-testid="long-term-fitness-chart" className="grid">
          <ChartCard title={t('perf.ctlCard')} description={t('perf.ctlSub')}>
            <LongTermFitnessChart ctl={P.ctl} />
          </ChartCard>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-12">
        {/* The curve grows with the FTP history next to it */}
        <div data-testid="power-curve-chart" className="grid lg:col-span-7 [&_[data-slot=card-content]]:flex [&_[data-slot=card-content]]:flex-1 [&_[data-slot=card-content]]:flex-col">
          <ChartCard title={t('dash.card.curve')} description={t('perf.curveSub', { y: P.lastYear })}>
            <PowerCurveChart curves={P.curves} curveWkg={P.curveWkg} lastYear={P.lastYear} />
          </ChartCard>
        </div>
        <div className="grid lg:col-span-5">
          <ChartCard title={t('perf.history')}>
            <FtpHistoryTable history={P.history} />
          </ChartCard>
        </div>
      </div>
      <ChartCard title={t('perf.profile')} description={t('perf.profileSub')}>
        <PowerProfileTable profile={P.profile} durations={P.durations} />
      </ChartCard>
    </div>
  );
}
