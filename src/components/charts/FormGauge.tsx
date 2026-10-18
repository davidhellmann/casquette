/** Scale of the gauge: value range, tick labels and coloured ranges ([from, to, colour token]). */
export interface GaugeScale { min: number; max: number; ticks: number[]; ranges: [number, number, string][] }

const CX = 110, CY = 104, R = 84;
const point = (deg: number, r: number) => [CX + r * Math.cos((deg * Math.PI) / 180), CY - r * Math.sin((deg * Math.PI) / 180)];

/**
 * Half-circle gauge (owned SVG): coloured ranges, tick labels and a needle at `value` (clamped to
 * the scale). Decorative – the value and its meaning are printed next to it.
 */
export function FormGauge({ value, scale, className }: { value: number; scale: GaugeScale; className?: string }) {
  const { min, max, ticks, ranges } = scale;
  const angle = (v: number) => 180 - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 180;
  const arc = (from: number, to: number) => {
    const [x0, y0] = point(angle(from) - 0.9, R), [x1, y1] = point(angle(to) + 0.9, R);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const tip = point(angle(value), R - 10), left = point(angle(value) + 90, 3.5), right = point(angle(value) - 90, 3.5);
  return (
    <svg viewBox="0 0 220 122" className={className} aria-hidden="true" data-slot="chart-svg">
      {ranges.map(([from, to, token]) => (
        <path key={from} d={arc(from, to)} stroke={`var(--${token})`} strokeWidth={12} fill="none" />
      ))}
      {ticks.map((v) => {
        const [x, y] = point(angle(v), R + 16);
        return <text key={v} x={x.toFixed(1)} y={(y + 3).toFixed(1)} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">{v}</text>;
      })}
      <path d={`M${left.join(',')} L${tip.join(',')} L${right.join(',')} Z`} fill="var(--foreground)" />
      <circle cx={CX} cy={CY} r={7} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2.5} />
    </svg>
  );
}
