const R = 56, C = 2 * Math.PI * R;

/**
 * Ring (owned SVG) filled to `share` (0–1) with a tick at `target` – the 80/20 check. Decorative:
 * the share is printed in its centre (`children`).
 */
export function PolarizationRing({ share, target, children, className }: { share: number; target: number; children?: React.ReactNode; className?: string }) {
  const off = C * (1 - Math.max(0, Math.min(1, share)));
  const a = ((-90 + target * 360) * Math.PI) / 180;
  const tick = [R - 9, R + 9].map((r) => [68 + r * Math.cos(a), 68 + r * Math.sin(a)]);
  return (
    <div className={`relative ${className ?? ''}`}>
      <svg viewBox="0 0 136 136" className="size-full" aria-hidden="true" data-slot="chart-svg">
        <circle cx={68} cy={68} r={R} stroke="var(--background)" strokeWidth={11} fill="none" />
        {share > 0 && (
          <circle cx={68} cy={68} r={R} stroke="var(--zone-2)" strokeWidth={11} fill="none" strokeLinecap="round"
            strokeDasharray={C.toFixed(1)} strokeDashoffset={off.toFixed(1)} transform="rotate(-90 68 68)" />
        )}
        <line x1={tick[0][0]} y1={tick[0][1]} x2={tick[1][0]} y2={tick[1][1]} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
