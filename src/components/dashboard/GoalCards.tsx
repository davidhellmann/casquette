import { Card } from '@/components/ui/card';
import { RichText } from '@/components/app/RichText';
import { CardLabel } from '@/components/app/CardLabel';
import { t } from '@/i18n/index.js';
import { cn } from 'cn';
import { goalCards } from './goals-data.js';
import { WithTip } from '@/components/app/KeyFigures';
import { Section } from './parts';

type Goal = ReturnType<typeof goalCards>[number];

function GoalCard({ g }: { g: Goal }) {
  return (
    <Card className="gap-2 px-5" data-slot="goal">
      <div className="flex items-start justify-between gap-3">
        <CardLabel as="h3">{g.eyebrow}</CardLabel>
        <span className={cn('rounded-sm bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums', g.status.up ? 'text-positive' : 'text-negative')}>{g.status.text}</span>
      </div>
      <p className="font-medium">{g.label}</p>
      {g.note && <p className="text-xs text-muted-foreground">{g.note}</p>}
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{g.value}</span>
        <span className="font-mono text-xs text-muted-foreground">{g.target}</span>
      </p>
      <WithTip tipHtml={g.pctTipHtml} className="py-1">
        <div className="relative h-2 rounded-full bg-background" role="presentation">
          <div className="h-full rounded-full bg-brand" style={{ width: `${g.pct.toFixed(1)}%` }} />
          {/* Where the plan stands today */}
          <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${g.pace.toFixed(1)}%` }} />
        </div>
        <RichText html={g.pctTipHtml} className="sr-only" />
      </WithTip>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        {g.meta.map((m) => <span key={m}>{m}</span>)}
      </div>
      <div className="flex items-center gap-1">
        {g.history.map((h, i) => (
          <span key={i} title={h.tip}
            className={cn('size-2.5 rounded-[2px]', h.hit ? 'bg-brand' : 'bg-background', h.current && 'ring-1 ring-foreground ring-offset-1 ring-offset-card')}>
            <span className="sr-only">{h.tip}</span>
          </span>
        ))}
        {g.streak && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{g.streak}</span>}
      </div>
    </Card>
  );
}

/** Goals (independent of the period) – one card each, only when goals are set. */
export function GoalCards({ goals, ridesAll, now }: { goals: any[]; ridesAll: any[]; now: Date }) {
  const cards = goalCards(goals, ridesAll, now);
  if (!cards.length) return null;
  return (
    <Section title={t('dash.sec.goals')} sub={t('dash.sec.goalsSub')} testId="goals">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((g) => <GoalCard key={g.id} g={g} />)}
      </div>
    </Section>
  );
}
