# UI fragments

Real pieces of the app for the website, instead of screenshots: static HTML copies of the demo build with the app's own CSS, scoped so it can't leak into the website or take styles from it. Crisp at any size, light and dark, no app JavaScript, no personal data (demo dataset only). Everything in this folder except this README and `OFL.txt` is generated – don't edit it by hand.

| File | What |
|---|---|
| `dashboard.html` | Dashboard top: key figures and the fitness chart (hero) |
| `load.html` | Training load key figure with sparkline (hero float) |
| `calendar.html` | Training calendar, last 52 weeks (hero float) |
| `intensity.html` | Dashboard intensity section (feature "Form, load, fitness.") |
| `ride.html` | Ride streams (feature "Second by second.") |
| `year.html` | Year review head: key figures and training calendar (feature "One page per year.") |
| `map-light.webp`, `map-dark.webp` | Route map with places panel – an image, Leaflet tiles can't be markup (2×) |
| `ui.css` | The app's CSS for the fragments, `@scope (.ui-fragment)`, plus the Geist fonts in `fonts/` |
| `fragments.json` | Size (CSS px), visible side (`anchor`) and source page of every piece |
| `index.html` | Preview of everything – open it in a browser; light or dark follows the system |

## Regenerate

```sh
npm run fragments              # demo build → serve → capture → website/ui/ (~30 s)
npm run fragments -- --check   # only compare: exit 1 if website/ui/ is out of date
```

- Builds the demo dataset (`DATA_SOURCE=demo`) into `dist-fragments/` with a fixed clock (the day after the newest demo ride, Europe/Berlin), serves it on a free port and drives the local Chromium (`CHROME_PATH` if none is found). The output only changes when the app or the demo data change. `--no-build` reuses the last build.
- Every piece is captured at the README screenshot viewport (1440×900, desktop layout) in light and dark; the markup has to be identical (colours are CSS variables). Afterwards the written fragments are rendered from `index.html` and every element's computed styles and box are compared with the app – any difference fails the run, and this folder is only replaced after a clean run.
- Pieces and framing: `scripts/lib/fragments.mjs` (`PIECES`, `MAP`); browser, demo guard and readiness: `scripts/lib/capture.mjs` (shared with the README screenshots). The map crop needs network access (OpenStreetMap tiles); `--check` compares it by presence only.
- Tests: `scripts/lib/{css-scope,fragments}.test.js` (scoping, stripping), `e2e-website/fragments.spec.ts` (`npm run test:website`: renders in light/dark, no app JS, isolation from a hostile host stylesheet, axe).

## How a fragment is made

1. Load the page, wait for fonts, hydration and drawn charts; reduce the piece to its `keep` children.
2. Strip it: scripts, hidden and screen-reader-only nodes, tooltips, comments and Astro islands go; event handlers, links, `tabindex`, `title`, HTML ids and id references are removed. Classes, inline styles, `data-*`/`aria-*` state and SVG geometry stay – the app's CSS selects on them.
3. SVG ids and shadcn chart ids get stable names per piece (`load-1`, `ride-chart-2`); the chart colour `<style>`s move into `ui.css`; `rem` becomes `px`.
4. Fix the width the charts were drawn for (`style="width:…px"` on the piece) and wrap it: `<div class="ui-fragment" data-fragment data-width data-height aria-hidden="true" inert>`.
5. `ui.css`: the app stylesheets, cascade layers flattened, viewport media queries resolved for the capture size (so the layout doesn't reflow on the website), unused selectors and hover/focus states dropped, every selector inside `@scope (.ui-fragment)` with an explicit `:scope`, the Geist fonts renamed to `"Casquette UI Geist"` / `"Casquette UI Geist Mono"`.

## Using them on the website

- Load `ui/ui.css` and put the fragment markup in the page – pasted into `index.html` or fetched by the site's own script and inserted. Each fragment once per page (its SVG ids are unique per piece, not per copy).
- Size: a fragment is laid out at `data-width` CSS px. Scale it as a whole (`zoom`, or `transform: scale()` with a wrapper of the scaled height) instead of changing its width – the charts are drawn SVG.
- Anchor: `fragments.json` → `anchor` is the side with the key content. When a piece bleeds off the page edge, pin that side (`right`: align the fragment's right edge, crop on the left).
- Theme: follows `prefers-color-scheme`; a `.dark` or `.light` class on an ancestor (or the wrapper) forces one. The tokens are custom properties on the wrapper – e.g. `background: var(--background)` on `.ui-fragment` gives the app's panel colour.
- Isolation: the fragments reset what the page passes on (inherited text styles, `rem`) and roll HTML back to browser defaults before the app's rules, so the site's base rules (`p`, `h2`, `button`, `* {}`, single classes) don't reach them, and nothing in `ui.css` matches outside `.ui-fragment`. Rules that descend into a fragment with more specificity (`.section p`) do – keep site selectors out of `.ui-fragment`.
- Animation hooks: chart lines `path.recharts-line-curve`, `path.recharts-area-curve` (areas: `.recharts-area-area`), calendar days `[role=gridcell]` with `data-day` (0 = oldest), key figure cards `[data-slot=kpi-card]`. CSS animations win over the app's declarations; respect `prefers-reduced-motion`.

The fonts in `fonts/` are Geist and Geist Mono under the SIL Open Font License (`OFL.txt`).
