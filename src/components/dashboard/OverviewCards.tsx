import { Bar as RBar, BarChart, Cell, XAxis } from 'recharts';
import { ChartCard } from '@/components/app/ChartCard';
import { EmptyState } from '@/components/app/EmptyState';
import { Hint } from '@/components/app/Hint';
import { RichText } from '@/components/app/RichText';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { FormGauge } from '@/components/charts/FormGauge';
import { PolarizationRing } from '@/components/charts/PolarizationRing';
import { Bar, ShareStrip, ZoneLabel } from '@/components/charts/ZoneBars';
import { barRadius, zoneColor } from '@/components/charts/series';
import { t } from '@/i18n/index.js';
import { FORM_SCALE, formToday, polarization, powerProfile, trainingLoad } from './overview-data.js';
import { Row, WithTip } from '@/components/app/KeyFigures';
import { Status } from './parts';

/** Form today: gauge of form (TSB), its status and fitness / fatigue / form. */
export function FormCard({ D }: { D: any }) {
  const F = formToday(D);
  return (
    <ChartCard title={t('dash.form.title')} description={t('dash.form.sub')} data-testid="form-card">
      <FormGauge value={F.tsb} scale={FORM_SCALE} className="mx-auto w-full max-w-56" />
      <div className="-mt-1 grid justify-items-center gap-1 text-center">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{F.value}</p>
        <Status tone={F.tone} className="ml-0">{F.label}</Status>
        <p className="text-xs text-muted-foreground">{F.description}</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {F.figures.map((x) => (
          <WithTip key={x.key} tipHtml={x.tipHtml} className="rounded-md bg-background px-2.5 py-2">
            <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{x.label}</p>
            <p className="font-semibold tabular-nums">
              {x.value}
              {x.delta && <span className={`ml-1 font-mono text-[10.5px] font-medium ${x.up ? 'text-positive' : 'text-negative'}`}>{x.delta}</span>}
            </p>
          </WithTip>
        ))}
      </div>
    </ChartCard>
  );
}

/** 80/20 check: easy share as a ring against the 80 % target, zone split and a hint. */
export function PolarizationCard({ D, zones }: { D: any; zones: any }) {
  const P = polarization(D, zones);
  return (
    <ChartCard title={t('dash.pol.title')} description={t('dash.pol.sub')} data-testid="polarization-card">
      {P.empty ? <EmptyState>{t('dash.chart.noIntensity')}</EmptyState> : (
        <>
          <div className="flex items-center gap-4">
            <PolarizationRing share={P.share} target={P.target} className="size-28 shrink-0">
              <span className="text-xl font-semibold tabular-nums">{P.low}%</span>
              <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{P.easy}</span>
            </PolarizationRing>
            <dl className="min-w-0 flex-1">
              {P.figures.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}
            </dl>
          </div>
          <div className="mt-4">
            <ShareStrip segments={P.segments.map((s) => ({ key: s.zone, value: s.value, color: zoneColor(s.zone), title: s.tip }))} />
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {P.segments.map((s) => <li key={s.zone}><ZoneLabel zone={s.zone} label={s.text} /></li>)}
            </ul>
          </div>
        </>
      )}
      {!P.empty && <Hint html={P.hintHtml} className="mt-4" />}
    </ChartCard>
  );
}

/** Power profile: W/kg at FTP and the period's best 5 s … 20 min. */
export function ProfileCard({ D, zones, kg }: { D: any; zones: any; kg: number }) {
  const P = powerProfile(D, { ftp: zones.ftp, kg });
  return (
    <ChartCard title={t('dash.profile.title')} description={t('dash.profile.sub')} data-testid="profile-card">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{P.wkgFtp}</span>
        <span className="text-xs text-muted-foreground">{P.atFtp}</span>
      </div>
      <RichText as="p" html={P.ftpHtml} className="text-xs text-muted-foreground [&_b]:font-medium [&_b]:text-foreground" />
      {P.empty ? <EmptyState className="mt-3 min-h-28">{t('dash.chart.noCurve')}</EmptyState> : (
        <ul className="mt-4 grid gap-2.5">
          {P.rows.map((r) => (
            <li key={r.s} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.75rem] items-center gap-3 text-xs" title={r.tip}>
              <span className="leading-tight">
                <span className="font-medium">{r.label}</span>
                <span className="block font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{r.name}</span>
              </span>
              <Bar width={r.share} color="var(--brand)" />
              <span className="text-right tabular-nums">
                {r.watts}
                {r.wkg && <span className="ml-1 text-muted-foreground">{r.wkg}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {P.hintHtml && <Hint html={P.hintHtml} className="mt-4" />}
    </ChartCard>
  );
}

/** Training load from all rides: daily load of the last 28 days, ramp, ACWR and a verdict. */
export function LoadCard({ D }: { D: any }) {
  const L = trainingLoad(D);
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: (typeof L.days)[number] }[] }) => {
    const row = active && payload?.[0]?.payload;
    return row ? <RichText as="div" html={row.tipHtml} className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground" /> : null;
  };
  return (
    <ChartCard title={t('dash.card.load')} description={t('dash.card.loadSub')} data-testid="load-card">
      <p className="sr-only">{L.barsTip}</p>
      <ChartContainer config={{ load: { label: L.barsTip, color: 'var(--brand)' } }} className="aspect-auto h-16 w-full">
        <BarChart data={L.days} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
          <XAxis dataKey="day" hide />
          <ChartTooltip cursor={false} content={<Tip />} />
          <RBar dataKey="load" radius={barRadius(L.days.length)} minPointSize={2} isAnimationActive={false}>
            {L.days.map((d) => <Cell key={d.day} fill={d.load ? 'var(--color-load)' : 'var(--background)'} />)}
          </RBar>
        </BarChart>
      </ChartContainer>
      <div className="mb-2 flex justify-between font-mono text-[10px] text-muted-foreground" aria-hidden="true"><span>{L.from}</span><span>{L.to}</span></div>
      <dl>
        {L.rows.map((r) => (
          <Row key={r.key} label={r.label} tipHtml={r.tip}>
            {r.value}
            {r.sub && <span className="ml-1 font-normal text-muted-foreground">{r.sub}</span>}
            {r.status && <Status tone={r.status.tone}>{r.status.text}</Status>}
          </Row>
        ))}
      </dl>
      <Hint html={L.verdict} className="mt-3" />
    </ChartCard>
  );
}
