import { ChartCard } from '@/components/app/ChartCard';
import { zoneColor } from '@/components/charts/series';
import { t } from '@/i18n/index.js';
import { cn } from 'cn';
import { fuelMatrix } from './fueling-data.js';

const f = (key: string) => t('dash.fueling.' + key);

/**
 * Carbs per hour by ride length and intensity; the selected ride's cell is highlighted.
 * A static grid, not a DataTable (DESIGN.md "Tables"): 3 × 2 cells, nothing to sort or search.
 */
export function FuelingMatrixCard({ cell }: { cell: string | null }) {
  const M = fuelMatrix();
  return (
    <ChartCard title={f('matrix')} description={f('matrixSub')} data-testid="fuel-matrix">
      <table className="w-full table-fixed border-separate border-spacing-1.5 text-xs">
        <thead>
          <tr>
            <td className="w-16" />
            {M.columns.map((c) => <th key={c} scope="col" className="text-left font-mono text-[10.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {M.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="text-left font-mono text-[10.5px] font-medium whitespace-nowrap text-muted-foreground">{r.label}</th>
              {r.cells.map((c) => (
                <td key={c.key} data-cell={c.key} aria-current={c.key === cell ? 'true' : undefined}
                  className={cn('rounded-md bg-background px-3 py-2.5 align-top', c.key === cell && 'ring-2 ring-brand')}>
                  <span aria-hidden="true" className="mb-2 block h-1 w-8 rounded-full" style={{ background: zoneColor(c.zone) }} />
                  <b className="block font-mono font-medium tabular-nums">{c.grams}</b>
                  <span className="text-muted-foreground">{c.text}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 grid list-disc gap-1 pl-4 text-xs text-muted-foreground">
        {M.tips.map((tip: string) => <li key={tip}>{tip}</li>)}
      </ul>
    </ChartCard>
  );
}
