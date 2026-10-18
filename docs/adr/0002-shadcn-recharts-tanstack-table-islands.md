---
status: accepted
---

# shadcn/ui + Recharts + TanStack Table on React islands in static Astro

The first UI was a bespoke "data sheet" system: a hand-written global stylesheet, page scripts that built HTML strings, and Chart.js configured by hand. Every new card or chart meant new markup, new CSS and a new imperative chart builder, and contributors had no shared component vocabulary. The redesign (#26) rebuilt every page on **shadcn/ui** (Radix primitives, Tailwind v4 on CSS-variable tokens, components owned in `src/components/ui/`), **shadcn charts** (Recharts) and **TanStack Table** (headless, rendered with the shadcn Table primitives), running as **React islands inside the static Astro site**. Astro still owns routing, content collections and all build-time data; the domain modules (ride, dashboard period, training) are untouched, and the islands only present their results.

## Considered options

- **Keep Astro, add React islands** (chosen). The site stays fully static and hostable anywhere; only interactive parts hydrate. shadcn/ui is the de-facto shared vocabulary for dashboards (sidebar, cards, data table, chart container) and lives in the repo, so it can be edited instead of overridden.
- **Move to a React SPA/meta-framework.** Rejected: Casquette has no server, and Astro's content collections and `getStaticPaths` already do the build-time work well.
- **TanStack Charts** for charts. Rejected: less mature than Recharts and not integrated with shadcn's `ChartContainer`/theming, so every chart would need its own colour and tooltip plumbing.
- **Keep Chart.js.** Rejected and removed: canvas charts configured imperatively, colours read from CSS at runtime and rebuilt on every theme switch, tooltips and empty states hand-made per chart – a second, parallel system next to the components.
- **Keep the hand-written stylesheet.** Rejected and removed: two styling systems (global CSS plus Tailwind) meant scoping hacks during the migration and a second set of rules to learn.

## Consequences

- One component system: new UI is composed from `src/components/ui/` and `src/components/app/`, styled with Tailwind utilities that resolve to the tokens in `src/styles/app.css`. No hex values, no second stylesheet (rules in `DESIGN.md`).
- Chart colours are `var(--token)` strings (one map, `SERIES` in `src/components/charts/series.ts`), so charts follow the light/dark theme without being rebuilt.
- Recharts needs real layout and renders nothing measurable in jsdom, so UI behaviour is tested end-to-end in Chromium against the built demo site (Playwright + axe), not with component tests.
- Pages ship React for their islands. Large build-time payloads go to the client as one JSON script and are computed there (dashboard, ride log); small ones as props.
- Leaflet stays for maps, wrapped in islands; visuals that shadcn charts don't cover (training calendar, form gauge, zone bars, 80/20 ring) are small owned SVG components on the same tokens.

## Notes

- **Large payloads stay an inline JSON script, not island props.** Dashboard, ride log and map read their build data from one `<script type="application/json">` (`#dash-data`, `#map-data`) on the client. Astro serialises island props into an HTML attribute of the island element, with its own type-tagged encoding and entity escaping – the ~230 KB demo payload of the dashboard would grow several-fold and be parsed twice (attribute, then props), and real data is larger. Small payloads (gear, performance, years, segments) stay props.
- **e2e serves the build with `e2e/serve.mjs`, not `astro preview`.** `astro preview` detaches into the background when it is not attached to a TTY, so Playwright's `webServer` could not keep track of it or stop it. The minimal static server runs in the foreground on a port derived from the checkout path, so parallel worktrees don't collide.
- **Colour by role, not one colour per metric.** The first pass of the redesign gave every metric its own token (fitness blue, fatigue violet, efficiency green …), and pages read as a rainbow. Charts now colour by role – pink primary, ink reference, grey comparison – and keep own colours only where a chart must tell series apart by meaning (ride streams, power vs. heart rate, zones, status, categories). The per-metric tokens `--fitness`, `--fatigue` and `--efficiency` were removed; rules in `DESIGN.md`.
- **`DATA_SOURCE=demo`** is the one deliberate addition to the data-source module (`src/lib/data-source.js`): it forces the tracked demo dataset for e2e tests and screenshots even when synced rides exist, without touching real data. Everything else about choosing real vs. demo data is unchanged.

