---
status: accepted
---

# English as the canonical domain language

Casquette (then called SDB) started with German domain terms in code and docs (*Fahrt*, *Athletenstand*, *Dashboard-Zeitraum* …) while the UI was already English via i18n. For the public release everything becomes English – docs, comments, identifiers, CLI output – so one vocabulary serves readers, contributors and the UI. `GLOSSARY.md` holds the canonical terms; this ADR holds the code rename map that #20 (domain core), #21 (scripts and CLI) and #22 (UI layer) follow. German stays only in the rename map below, as a record of the old names.

## Consequences

- Renames are mechanical: use exactly the names below, move files with `git mv`, and update every import, test name and doc reference (`docs/ride.md`, `docs/dashboard-period.md`, this table) in the same change.
- The ride storage journal file is renamed. A pending journal under the old name must still be recovered (or migrated) on first access, otherwise an interrupted write from before the rename would be lost.
- `athleteState` replaces the overloaded `stand` everywhere, including the build payload (`athlete.stand` → `athlete.athleteState`) and the year data (`Y.stand`). Payload and page must change together.
- Names that are already English (`athleteTimeline`, `calendarDate`, `fuel`, `bestCurve`, `rideCalendar` …) stay as they are.

## Rename map

### Modules and files

| Current path | New path | Glossary term | Ticket |
|---|---|---|---|
| `src/fahrt/` | `src/ride/` | Ride (ride module) | #20 |
| `src/fahrt/index.js` | `src/ride/index.js` | Ride | #20 |
| `src/fahrt/fahrt.test.js` | `src/ride/ride.test.js` | Ride | #20 |
| `src/fahrt/power-distribution.js` | `src/ride/power-distribution.js` | Power distribution | #20 |
| `src/dashboard-zeitraum/` | `src/dashboard-period/` | Dashboard period | #20 |
| `src/dashboard-zeitraum/{index,cards,history,fixtures}.js`, `index.test.js`, `legacy-*.json` | same file names under `src/dashboard-period/` | Dashboard period | #20 |
| `src/training/athletenstand.js` | `src/training/athlete-state.js` | Athlete state | #20 |
| `src/training/athletenstand.test.js` | `src/training/athlete-state.test.js` | Athlete state | #20 |
| `src/lib/athletenstand.test.js` | `src/lib/athlete-state.test.js` | Athlete state | #20 |
| `src/training/empfehlungen.js` | `src/training/recommendations.js` | Recommendations | #20 |
| `src/training/fahrt-typ.js` | `src/training/ride-type.js` | Ride type | #20 |
| `src/training/fahrt-typ.test.js` | `src/training/ride-type.test.js` | Ride type | #20 |
| `src/training/kalender.js` | `src/training/calendar-day.js` | Calendar day | #20 |
| `src/training/power-kurve.js` | `src/training/power-curve.js` | Power curve | #20 |
| `src/training/power-kurve.test.js` | `src/training/power-curve.test.js` | Power curve | #20 |
| `src/training/verpflegung.js` | `src/training/fueling.js` | Fueling | #20 |
| `src/training/verpflegung.test.js` | `src/training/fueling.test.js` | Fueling | #20 |
| `src/training/zonen.js` | `src/training/zones.js` | Zones | #20 |
| `src/training/zonen.test.js` | `src/training/zones.test.js` | Zones | #20 |
| `scripts/lib/fahrt-ablage.mjs` | `scripts/lib/ride-storage.mjs` | Ride storage | #21 |
| `scripts/lib/fahrt-ablage.test.js` | `scripts/lib/ride-storage.test.js` | Ride storage | #21 |
| `.strava-cache/fahrt-pending.json` | `.strava-cache/ride-storage-pending.json` | Ride storage | #21 |

`scripts/lib/store.mjs` (formatting and gear writer) keeps its name; it is not the ride storage.

### Identifiers

| Current | New | Where | Ticket |
|---|---|---|---|
| `processFahrt` | `processRide` | `src/fahrt/index.js` and all callers | #20 |
| `dashboardZeitraum` | `dashboardPeriod` | `src/dashboard-zeitraum/index.js` and all callers | #20 |
| `stand` (parameter, option, fixture export, local variable) | `athleteState` | ride module, dashboard period, `src/lib/years.js`, tests | #20 |
| `athlete.stand` (payload), `ATH.stand`, `Y.stand` | `athlete.athleteState`, `ATH.athleteState`, `Y.athleteState` | `src/lib/dashboard-payload.js`, `src/scripts/dashboard.js`, `src/scripts/rides.js`, `src/pages/years/[year].astro` | #22 |
| `createFahrtAblage` | `createRideStorage` | `scripts/lib/fahrt-ablage.mjs`, `sync.mjs`, `geo.mjs`, `rebuild.mjs`, `power-backfill.mjs` | #21 |
| `loadFahrtContext` | `loadRideStorageContext` | same | #21 |
| `ablage` (local variable) | `storage` | `scripts/lib/sync.mjs`, `scripts/geo.mjs` and others | #21 |

### German words in comments, test names and messages

Translate into the glossary terms (e.g. *Fahrt* → ride, *Statistik-Fahrt* → stat ride, *Zeitraum* → period, *Vorperiode* → previous period, *Last* → load, *Verteilung* → power distribution, *Kurve* → power curve). Error and CLI messages follow the same terms (#21); UI strings already live in `src/i18n/en.js` (#22).
