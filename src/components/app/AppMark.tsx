/**
 * The logo, the only place it comes from in the UI. AppLogo: "casquette." set in Damion (real text,
 * font via the Astro Fonts API) with the cap resting on the "c"; AppMark: the cap alone.
 * Geometry and placement: src/lib/brand.js (also the source of the favicon and icons). Rules: DESIGN.md → Brand.
 * Ink follows `currentColor`, the stripe and the full stop are `--brand`.
 */
import type { CSSProperties } from 'react';
import { CAP, WORDMARK, capPlacement } from '@/lib/brand.js';
import { cn } from 'cn';

function Cap({ className, style, slot }: { className?: string; style?: CSSProperties; slot?: string }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox={CAP.viewBox}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-slot={slot}
    >
      <path d={CAP.outline} stroke="currentColor" strokeWidth={CAP.stroke} />
      <path d={CAP.stripe} stroke="var(--brand)" strokeWidth={CAP.stroke * CAP.stripeFactor} />
    </svg>
  );
}

/** The cap alone (collapsed sidebar). */
export function AppMark({ className }: { className?: string }) {
  return <Cap className={className} slot="app-mark" />;
}

// Static em offsets from the approved formula and Damion's metrics: no measuring, no layout jank,
// scales with the font size set on AppLogo.
const P = capPlacement();
const em = (v: number) => `${Math.round(v * 10000) / 10000}em`;
const CAP_STYLE: CSSProperties = {
  position: 'absolute',
  left: em(P.left),
  top: em(P.top),
  width: em(P.width),
  height: em(P.height),
  transform: `rotate(${P.rotate}deg)`,
  transformOrigin: P.origin,
};

/** The logo: word + full stop + the cap on the "c". Size it with a font size (`text-[…]`). */
export function AppLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block font-logo font-normal whitespace-nowrap', className)}
      // line-height 1 inline: a font-size class (`text-…`) would otherwise drop `leading-none`
      style={{ lineHeight: 1, paddingLeft: em(-P.left) }}
      aria-hidden="true"
      data-slot="app-logo"
    >
      <span className="relative inline-block">
        {/* the "c" in its own span, as on the approval sheet the placement was measured on */}
        <span>{WORDMARK.text[0]}</span>
        {WORDMARK.text.slice(1)}
        <span className="text-brand">{WORDMARK.stop}</span>
        <Cap style={CAP_STYLE} />
      </span>
    </span>
  );
}
