# Design

How the app looks and how UI is built. The code is the source of truth: tokens in `src/styles/app.css`, chart colours and shapes in `src/components/charts/series.ts`, building blocks in `src/components/app/` and `src/components/charts/`. Stack decision: [ADR 0002](docs/adr/0002-shadcn-recharts-tanstack-table-islands.md).

## Principles

1. **Grey and pink.** Calm cool greys (light) or navy (dark), pink as the one accent. A page should read grey and pink, never as a rainbow.
2. **Reuse before you build.** Compose pages from the building blocks below. A new pattern is added once – as a component and a line in this file – then reused.
3. **Tokens only.** Every colour is a CSS variable with a light and a dark value. No hex values, no Tailwind palette colours (`text-red-500`) in components.
4. **Quiet surfaces.** Cards are a fill, not a frame: no shadows, no card borders, few lines, rounded corners.
5. **Data first.** Numbers are tabular and calm, charts are honest (no smoothing past the real values), every chart has an empty state.

## Look & feel

- Layout of a familiar analytics dashboard: sidebar on the canvas, one rounded content panel, KPI cards, a main chart, a grid of chart cards, tables.
- Surfaces, back to front: `--sidebar` (canvas) → `--background` (content panel) → `--card` (card fill). Popovers and tooltips are `--popover` with a 1 px `--border` instead of a shadow.
- Lines only for inputs, table rows and popover edges. No hairline grids, no framed cards.
- Radius `--radius` (8 px): `rounded-lg` for cards and the panel, `rounded-md`/`rounded-sm` inside.
- Card titles are small uppercase mono labels on a pink chip (`CardLabel`). Everything else in a card is ink or muted grey.

## Colour

Pink is the default data colour. Grey comes from the frame. Other colours only where a chart has to tell series apart **by meaning**. The one functional exception (form follows function): zones keep the traditional saturated scale – slate, green, yellow, orange, red, carmine, violet – so they read at a glance, and in a ride's streams power and heart rate are drawn in the colour of their zone.

| Role | Token | Use |
|---|---|---|
| Primary | `--brand` | Every single-series chart, KPI sparklines, "this ride / this year / this period", the highlighted bar, progress bars, goal streaks, highlight icons, value tints in tables, routes without zones |
| Highlight vs. rest | `--brand` at full vs. ~40 % opacity | The current year/month among the others (same series) |
| Reference | `--foreground` (ink) | All-time best curve, FTP (dotted), best so far (dashed step), hours next to pink distance bars |
| Comparison / context | `--muted-foreground` (grey) | Previous year or period (dashed), fatigue (dashed), bars behind a line (best 20 min), weight, indoor share |
| Accent surface | `--brand-surface`, `--brand-surface-foreground` | `CardLabel` chips, PR rank 1, badges that mark something special |
| Status | `--positive`, `--warning`, `--negative` | Deltas, better/worse, form bars, traffic-light verdicts (ramp rate, ACWR, decoupling), start/finish pins |
| Power vs. heart rate | `--power`, `--heart-rate` | Only where both share one chart: power vs. heart rate per ride (dashboard), the ride analysis overlay, segment attempt tooltips |
| Zones | `--zone-1` … `--zone-7` | Power zones (7) and HR zones (5), traditional saturated scale: zone bars, zone badges, zone-coloured routes, **zone-coloured power and heart-rate streams** (ride page, `SERIES.*.zoned`), weekly volume by zone, fueling matrix, EF dots. Nothing else. |
| Stream context | `--muted-foreground` (grey) | Cadence, speed and elevation in the ride streams – no colours of their own |
| Training calendar | `--load-0` … `--load-4` | Empty day + four pink load steps. Nothing else. |
| Categories | `--category-1` … `--category-6` | Several things side by side without a meaning of their own: bikes, terrains, earlier years. Pink first, then navy, slate, berry, rose, grey – so even a multi-bike chart stays grey and pink. |
| Chart grid | `--grid` | `CartesianGrid` lines |

- Bikes keep one colour everywhere: `bikeColors(allBikeIds)` in `src/components/charts/categories.ts` assigns `--category-*` by position in the full bike list; terrains via `terrainColor()`. Earlier years: `COMPARE_COLORS` in `series.ts`.
- `--chart-1…5` exist for shadcn defaults and point at the categories – use the named tokens.
- Zone colours sit next to text, never behind it (contrast). Text on a solid pink fill uses `--brand-foreground` (ink).

## Typography

- **Geist** for UI and numbers, **Geist Mono** for labels, units, badges and axis-adjacent text (`font-sans` / `font-mono`, served locally via the Astro Fonts API).
- Weights **400 / 500 / 600** only. `b`/`strong` render 600.
- `tabular-nums` on `body`; tables and KPIs repeat it where they change fonts.
- Sizes: detail title `text-2xl font-semibold tracking-tight` (`sm:text-3xl` on rides and segments), KPI value `text-2xl sm:text-3xl font-semibold`, section heading `text-sm font-medium`, labels mono `text-[10.5px] uppercase tracking-[0.08em]`, units `ml-1 font-mono text-xs text-muted-foreground`.

## Charts

shadcn charts on Recharts (`ChartContainer` + `ChartConfig`, `src/components/ui/chart.tsx`). Reference: `src/components/dashboard/FitnessChart.tsx`.

- **`SERIES` decides colour and shape** – one entry per data meaning, colour by role (see Colour). A new series is a new `SERIES` entry, never a colour in the chart.
- **Shape:** round where the data is aggregated, hard where every point is a measurement, steps where a value holds.
  - `monotone` – sparklines, totals per week/month/year, cumulative distance, fitness, eFTP, W/kg, efficiency trend, power curves. Never `natural`/`basis`: a line must not overshoot zero or the real peak.
  - `linear` – fatigue, daily load, ride streams, segment attempts.
  - `stepAfter` – FTP, weight, best so far.
- **Bars:** `barRadius(count)` – rounded tops when they stand alone, square when dense (≥ 60).
- **Lines:** no dots at rest (`dot={false}`), one `activeDot` on hover. Primary line 2–2.25 px with a soft gradient fill when it stands alone; references and comparisons 1.25–1.5 px.
- **Zone-coloured lines** (power and heart-rate streams): one path, stroked and filled with a vertical gradient in plot coordinates that has a hard stop at every zone boundary of the value axis (`zoneBands()` in `ride/ride-data.js`, `ZoneGradient` in `ride/StreamCharts.tsx`) – every value in its zone colour, no split paths, no extra cost per point.
- **Scatter:** one dot per ride/attempt, small, `--card` stroke, visible at rest.
- **Axes:** `niceTicks(min, max)`, `CartesianGrid vertical={false} stroke="var(--grid)"`, small muted tick text.
- **Legend and tooltip:** `SeriesLegend` above the chart (`aria-hidden`), `TooltipBox` as tooltip body (`src/components/charts/chart-parts.tsx`).
- **Performance:** `thin()` for long daily series, downsampled streams, `isAnimationActive={false}`.
- A chart card renders a chart **or** an `EmptyState` – never an empty chart.

## Tables

One look for every `DataTable` (`app/DataTable.tsx`); ride lists add two options on top. Reference: `rides/ride-columns.tsx`.

- **Ride lists** (ride log, recent rides, a year's and a bike's rides) are one composite, `RideList` (`rides/RideList.tsx`): it owns the table setup (columns, row id and link, search by name and place, tiles, grouping, summary). Rows come from `rideRows(rides, { basis })` (`rides/ride-list.js`) – the same fields everywhere (places, zone and its source, fueling); build pages pass them as island props (dates stay Dates).

- **Base style:** header labels small uppercase mono, muted; rows separated by a thin hairline (`border-border/70`) – no zebra, no card per row; comfortable height (`py-2.5`). Sortable headers. Numbers right-aligned, tabular.
- **Hover:** a linked row takes the panel fill (`bg-background` on the card), the pointer cursor and a thin pink edge on its left (3 px inset line on the first cell, `--brand`; also on keyboard focus) – calm, no movement.
- **Ride cells are two lines:** date (day + month, `font-medium`; weekday below, muted) and ride (name as the row's real link; places or "Indoor" below, muted). Units small and muted after the value (`WithUnit`: km, m, W, bpm, g/h).
- **Markers:** PR count as a small pink-tinted chip "PR n" (`--brand-surface`), indoor as a small house icon, e-bike as a muted mono tag. No emoji, no icon soup.
- **One option per view** (ride lists only – ride log, recent rides, a year's and a bike's rides): the **table** is flat and sortable by its column headers; the **tiles** always come in date order (switching to them resets a table sort) and can be grouped – `grouping={rideGrouping(initial)}` adds "Group by None / Week / Month", shown only with the tiles. Each week (ISO, "Week 41", the year only when it isn't the current one) or month gets a header line with its totals (km · time, over all pages). Week is the default. Tables without a time axis (segments, laps, splits, power profile, FTP history, months) have neither.
- **Tiles** (ride lists): `tiles={rideTiles()}` adds a "Table / Tiles" toggle. A tile is one rounded link: date + weekday, name + place, four key figures with small mono labels (km, time, NP or avg W, zone + TSS). Tiles sit on `bg-background/55` and take the full panel fill plus the same thin pink left edge on hover – no lift, no nudge; keyboard focus shows the ring. Grouping lives here (a header line above each group's list). The choice is shared by all ride lists (`localStorage rc_table_view`); below 640 px ride lists always show tiles and the toggle is hidden.
- **Accessibility:** the table view is a real `<table>` (`aria-label`, `aria-sort`); tiles are lists of links, one per group, labelled by the group header.

## Navigation

- Sidebar = `AppSidebar` from `app/nav.ts`: two labelled groups, one entry per section, the current one marked (`aria-current="page"`).
- **Submenus** (`app/NavSubmenu.tsx`, shadcn `Collapsible` + `SidebarMenuSub`): Rides lists the last 5 rides (date · km), Years the latest 3 years, Gear the active bikes (retired ones only on the overview), each entry two lines – the name, its km below (mono, muted) – plus an "All years / All gear →" link to the overview. No marker dots. Data comes from the build (`Base.astro` → `AppShell`).
- **Open state:** the current section's group opens by itself and marks the current entry; other groups stay as the user left them (`localStorage rc_nav_open`, restored before the first paint like `rc_sidebar`). The chevron toggles, the section name links to the overview.
- **Collapsed sidebar:** the section icon opens a flyout (`DropdownMenu`, right of the rail) with the same entries. The mobile sheet shows the same groups.

## Building blocks

Look here first. If something fits 80 %, extend it rather than writing a second one. A part used by a second feature folder moves to `src/components/app/`.

| Need | Use | Where |
|---|---|---|
| Page frame, sidebar, breadcrumbs, period / zone-basis / year controls | `Base` layout props (`title`, `active`, `period`, `yearSwitch`) → `AppShell`; sidebar submenus `NavSubmenu` (see Navigation) | `src/layouts/Base.astro`, `app/AppShell.tsx`, `app/NavSubmenu.tsx` |
| Detail page title | Visible `<h1>` (detail title size) with a mono kicker and a muted meta line; overview pages use an `sr-only` `<h1>` | `ride/RideView.tsx` |
| Section heading over a group of cards | `Section` | `dashboard/parts.tsx` |
| Card | `Card` (C1: `rounded-lg bg-card py-5`) + `CardLabel` | `ui/card.tsx`, `app/CardLabel.tsx` |
| Card with one chart | `ChartCard` (title, description, `action`) | `app/ChartCard.tsx` |
| Key figure | `KpiCard` (label, value + unit, `DeltaBadge`, context line, pink sparkline via `spark` + `series`) | `app/KpiCard.tsx` |
| Figures inside a card | `Row` (label/value line in a `<dl>`), `Figure` (number + small label), `WithTip` | `app/KeyFigures.tsx` |
| Change in % | `DeltaBadge` | `app/DeltaBadge.tsx` |
| Status word with a dot | `Status` (`tone` = a status token) | `dashboard/parts.tsx` |
| A few exclusive options | `SegmentedToggle` (`size="sm"` in card headers); power/HR switch `BasisToggle` | `app/SegmentedToggle.tsx`, `dashboard/parts.tsx` |
| No data | `EmptyState` | `app/EmptyState.tsx` |
| Coaching hint | `Hint` (muted text + bulb, no box) | `app/Hint.tsx` |
| i18n string with `<b>` | `RichText` | `app/RichText.tsx` |
| Legend, tooltip | `SeriesLegend`, `TooltipBox` | `charts/chart-parts.tsx` |
| Colour + shape of a series | `SERIES`, `zoneColor()`, `COMPARE_COLORS`, `barRadius()`, `niceTicks()`, `thin()` | `charts/series.ts` |
| Bikes, terrains | `bikeColors()`, `terrainColor()` | `charts/categories.ts` |
| Time in zones, zone bars | `TimeInZones` (stored seconds), `ZoneBars` (rows), `ZoneLabel`, `Bar`, `ShareStrip` | `charts/ZoneBars.tsx` |
| Training calendar | `TrainingCalendar` + `CalendarStats` + `CalendarLegend` (a day with several rides opens a `DropdownMenu` to choose one) | `charts/TrainingCalendar.tsx` |
| Gauge, share ring | `FormGauge`, `PolarizationRing` | `charts/` |
| Table | `DataTable` + `dataTableColumns<Row>()`, `numeric()`, `numSort`; ride lists: `RideList` + `rideRows()` (built on `rideColumns()`, `rideGrouping()`, `rideTiles()`, `WithUnit` – see Tables) | `app/DataTable.tsx`, `app/table-groups.ts`, `rides/RideList.tsx`, `rides/ride-list.js`, `rides/ride-columns.tsx` |
| A ride's classification, TIZ basis, decoupling as text and tones | `rideClassification()`, `tizBasisLabel()`, `rideTimeInZones()`, `rideDecoupling()` + `DecouplingScale` (one scale, 0 – 1.5 × the drift limit), `zoneBg()`, `toneBg()`, `ZoneBadge` | `ride/ride-presentation.js`, `ride/DecouplingScale.tsx`, `rides/ride-columns.tsx` |
| A ride's streams | `useChartStreams(id)` (loads once per page), `streamRows()` (downsampled, optionally smoothed rows), `rollingMean()` | `app/use-chart-streams.ts`, `src/lib/chart-streams.js` |
| Internal links | `routes.ride(id)`, `.gear()`, `.year()`, `.segment()`, `.map({ country, place })`, `.rides()`, `.streams()` – never build paths by hand | `src/lib/routes.js` |
| Map | `useLeaflet` hook; `withColors()` to resolve tokens for Leaflet's canvas | `map/use-leaflet.ts` |
| Primitives | shadcn: Badge, Breadcrumb, Button, Collapsible, DropdownMenu, Input, Select, Separator, Sheet, Sidebar, Skeleton, Table, Tabs, ToggleGroup, Tooltip, Chart (owned – edit freely; add more with `npx shadcn@latest add <name>`) | `src/components/ui/` |

## Recipes

**New page**

1. `src/pages/<name>.astro`: load build-time data, render `<Base title={…} active="…">` with one React view island (`client:load`). Small data as props; large data as one `<script type="application/json">` read on the client.
2. View in `src/components/<name>/`: `<h1>` (visible or `sr-only`) → KPI row `grid grid-cols-2 gap-3 xl:grid-cols-4` → main chart → card grid `grid gap-3 lg:grid-cols-12` → tables. Computations live in a pure `*-data.js` next to the view or in the domain modules; components only present.
3. Add the sidebar entry in `app/nav.ts`, strings in `src/i18n/en.js`, an e2e spec in `e2e/`.

**New card** – `ChartCard` (or `Card` + `CardLabel`) inside the view's `gap-3` grid. Figures via `Row`/`Figure`, no data via `EmptyState`.

**New chart** – `ChartCard` → `SeriesLegend` → `ChartContainer` with a `ChartConfig` whose colours come from `SERIES`. One series → pink. Two or more: pink for the main one, ink for a reference, grey for a comparison; own colours only for streams, zones or categories. Add an `sr-only` sentence with the key values.

**New table** – `DataTable` with `dataTableColumns<Row>()`; set `meta.label` on every column and `numeric()` on numbers; `rowHref` for linked rows (keep one real link per row). A list of rides is a `RideList` with rows from `rideRows()`, the `columns` it shows and a `storageId`. Plain `ui/table` only for static key/value lists or fixed grids (fueling matrix).

## Language & numbers

- No hard-coded UI strings, aria labels or tooltips: keys in `src/i18n/en.js`, read via `t()` / `LOCALE` from `src/i18n/index.js`.
- Numbers via `nf(value, dec)` (locale separators, `–` for missing); durations `fmtDur` / `fmtClock` / `fmtHm`; dates via the named helpers in `src/scripts/format.js`. Never `toFixed` or `toLocaleDateString` options in a component – add a helper.
- Units small and muted next to the value (`km`, `m`, `W`, `bpm`, `TSS`, `W/kg`).

## Accessibility

- Landmarks (`nav`, one `main`), one `<h1>` per page, cards titled with `CardLabel` headings.
- Visible focus rings (`ring`) on everything interactive; every control labelled.
- Charts: key values in an `sr-only` sentence; decorative charts (sparklines) inside `aria-hidden` with `accessibilityLayer={false}`.
- Contrast: small text ≥ 4.5:1. Colour never carries meaning alone – pair it with a label, a dash or a position.
- `prefers-reduced-motion` turns off all motion (`app.css`). Only colour transitions on hover/focus and shadcn's popover/sheet animations; no count-ups, no chart animations.
- The axe check in `e2e/shell.spec.ts` runs on every page and must stay green.

## Dark mode

- Class-based: `.dark` on `<html>`, set before first paint by the inline script in `Base.astro` (`localStorage rc_theme`: `light` | `dark` | `auto`, none = light – the app reads best in light; the website keeps its own `rc_site_theme`, dark by default); `src/lib/theme.ts` switches it and announces `app:theme`.
- Every token has a dark value (`src/styles/tokens.test.js` fails otherwise); tokens that alias another token (`--category-1: var(--brand)`) follow it. Data colours are lighter on navy.
- Charts use `var(--token)` and re-colour without a rebuild. No `getComputedStyle` colour reads – except `withColors()` for Leaflet's canvas.

## Brand

- **Name:** Casquette (the classic cotton cycling cap) – always with a capital C, never abbreviated. It comes from `t('app.name')`; page titles from `pageTitle()` (`src/i18n/index.js`) → "Rides · Casquette". The npm package is `casquette`.
- **The logo – "cap on the c":** the word "casquette" set in Damion (SIL OFL) exactly as the font draws it – real text, no outlines, no redrawing – followed by a full stop in `--brand`, with the cap resting tilted (−19°) on the "c". This is the owner-approved logo; it is used everywhere the name is shown as a logo (sidebar header, README header, OG image). Damion is self-hosted through the Astro Fonts API (`--font-damion`, utility `font-logo`) and used for nothing else.
- **Mark – the cap:** the original cap sketch "f": a cotton cycling cap in three-quarter view, peak down, one line with round caps and joins, no fills (viewBox `-2 -2 48 36`, stroke 2.4, stripe × 1.3). Outline in ink (`currentColor`: ink on grey, light ink on navy), the one stripe on the crown in `--brand`. In the logo the cap is 0.936 em wide; its position follows the approved formula, `capPlacement()` in `src/lib/brand.js` (static em offsets from Damion's metrics, so it scales with the font size and never shifts after load). The cap stands alone in the collapsed sidebar and as the favicon/app icon (heavier stroke at 16/32 px).
- **Clear space and size:** keep at least the cap's stripe-to-peak distance (≈ ½ the cap height) free around the logo; cap ≥ 16 px wide, logo font size ≥ 24 px.
- **Tiles:** app icon and favicon put the cap on a solid tile – ink in light contexts, navy in dark ones (the favicon switches with `prefers-color-scheme`), outline light, stripe `#ff5c9c`. The apple-touch icon is full-bleed (iOS rounds it).
- ✅ Ink/light-ink outline, pink stripe and full stop only. ❌ No recolouring the outline pink, no second stripe, no outlines/shadows/gradients, no stretching, no other font for the word and no redrawn letters or cap, no moving the cap off the formula, no logo on busy backgrounds.
- **One source:** cap paths, word and placement live in `src/lib/brand.js`; `AppLogo` / `AppMark` (`src/components/app/AppMark.tsx`) render them in the UI (the sidebar's home link, accessible name "Casquette – home"). `npm run brand` regenerates every static asset from it: `public/favicon.svg`, `brand/casquette-icon-{light,dark}.svg` (cap alone) and – rendered with the local Chromium from HTML that loads Damion (`@fontsource/damion`) – `public/apple-touch-icon.png`, `public/og.png` and `brand/casquette-logo-{light,dark}.png` (README header; PNG because GitHub doesn't load web fonts in SVG). `src/brand.test.js` fails when an asset is out of date (`brand/png-sources.json` fingerprints the PNG sources). Earlier directions (Cells, Curve, Monogram, the cap sketch, the unrefined Damion setting) are kept with previews in `brand/explorations/`. The promo website (`website/`, no build) carries copies: the palette as tokens in `website/site.css`, the logo as markup + static em offsets (checked against `brand.js` by `src/brand.test.js`), Damion in `website/fonts/`, and its favicon, apple-touch icon and OG image, which `npm run brand` writes/copies there too.

## Do / Don't

- ✅ Pink for the main series, grey for the rest. Ink for references.
- ✅ New series = `SERIES` entry; new card = `ChartCard`; new table = `DataTable`; no data = `EmptyState`.
- ❌ No zebra rows, no hover movement on rows or tiles; the only row edge is the pink hover edge on linked rows.
- ✅ Extend a building block before writing a new one; document new ones here.
- ❌ No rainbow: no new colour per chart, no colour without a meaning.
- ❌ No shadows, no card borders, no coloured frame surfaces, no extra lines.
- ❌ No hex values, no Tailwind palette colours, no `getComputedStyle` colour reads (except `withColors()`).
- ❌ No zone or load colours outside zones and the calendar.
- ❌ No `natural`/`basis` curves, no dots on lines at rest.
- ❌ No other typefaces or weights than Geist / Geist Mono 400/500/600.
- ❌ No component CSS – Tailwind utilities on tokens. `app.css` holds tokens, base rules and Leaflet overrides only.
- ❌ No hard-coded strings, no `toLocaleString` without `LOCALE`.
