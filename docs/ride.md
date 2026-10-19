# Ride metrics (Refs #5)

Terms follow `GLOSSARY.md`. Code identifiers below are quoted as they currently exist; the
planned English names are listed in `docs/adr/0001-english-domain-language.md`.

`src/ride/index.ts` is the pure entry point of the ride module: `processRide(frontmatter, athleteState)`.
The caller passes `athleteTimeline(...).at(frontmatter.start_date_local)` from #4.
The build dataset (`src/lib/build-dataset.ts`, see "Build dataset and page payloads" below) loads
this state centrally and delegates, once per ride; all build pages use the same ride.
Astro/FS/streams/clock are not dependencies of the ride module. Besides the metrics the ride
carries what its ride page shows from the frontmatter: `elev_low`/`elev_high`, `rpe`
(perceived exertion), `laps`, `splits` (metric splits) and `segs` (segment efforts).

**Date ≠ instant:** `start` keeps `start_date` as Unix milliseconds (including
sub-seconds); only this actual start decides whether a ride lies in the future.
`start_local` keeps the written local ride time. `d`, year, month and the
athlete state use its calendar components, even for strings with Z/offset;
they must not be converted into the browser/build time zone. A Date object
no longer has a source offset: its host-local components apply. History with
`date: YYYY-MM-DD` applies from that local calendar day, not from UTC midnight.
If `start_date` is missing in legacy/synthetic input, `start` stays `null`; only then does
the period use the previous local time comparison, without claiming an exact start.
Dashboard and goals read the same flat ride fields; the former `toDashboard` reshaping has been removed (Refs #6).

## Athlete state (Refs #4)

The athlete state is FTP, body weight and zones on a date (`athleteTimeline({ athlete, history, zonesFile }).at(date)`,
I/O-free in the training module). Date means the local calendar day: date-only history applies
from the start of that day; offset strings keep their written day, Date objects use host-local
components (the source offset cannot be reconstructed). FTP and weight are carried forward
independently: the last valid entry up to and including the date; before that, the earliest known
value of each. If a value is missing from the whole history, the current athlete data applies
(`zones.ftp`, then `profile.ftp`; `profile.weight`), otherwise 200 W / 75 kg. Only positive finite
numbers are valid measurements. Zones are resolved per date (Refs #51, ADR 0003):

- **Power zones** derive from this FTP: with the lower bounds in % of FTP from the zones file,
  otherwise Coggan. Strava's power zones are never used.
- **HR zones** come from the zones file entry valid on the date (the last `from` on or before it;
  before the first one the first entry; an entry without `from` applies from the beginning),
  otherwise the current Strava zones (Strava provides no history), otherwise the default HR zones.
- `zones.source` says where they came from: `{ power: 'file'|'default', hr: 'file'|'strava'|'default' }`.

The zones file `src/data/zones.json` is optional; its example only documents the format, so without
the file nothing changes. HR: 5 rising lower bounds in bpm starting at 0; power: 7 rising lower
bounds in % of FTP starting at 0, rounded to watts like Coggan. An invalid or unparsable file fails
the build with the field named. "Today" is the state at build time.
W/kg of a ride or of a power best uses the weight on the date of origin, not a flat yearly or
current weight; if the originating ride is missing, W/kg stays unknown. The build loads the athlete
and the FTP/weight history once, centrally, in the build dataset (`src/lib/build-dataset.ts`).

## Deliberate consolidation

| Value | Final rule | Previous differences |
| --- | --- | --- |
| Avg power `w` | Only `device_watts`; missing = `null`, 0 stays 0 | Unchanged; estimated summary watts are not a power meter |
| NP `np` | `metrics.np`, else measured `weighted_average_watts`, else `null` | Unchanged; stored stream NP is usable even without summary `device_watts` |
| IF `if_` | NP / FTP on the ride date, `null` without NP | No avg-power substitute, not in the dashboard either |
| TSS `tss` | Rounded hours × IF² × 100, `null` without NP | Persisted sync IF/TSS may use a different FTP and are ignored; no avg-power substitute, so load/CTL/ATL from #2 stay intact |
| EF `ef` | NP / avg HR (> 0), rounded to 3 decimals like the sync, else `null` | Previously taken from the sync; now computed centrally for build and dashboard, without avg-power substitute or 20-minute filter |
| Load `load` | `rideLoad`: TSS ?? Relative Effort ?? 0 | Rule from #2 unchanged; performance passes this final load to `fitnessSeries` |
| `clsP`, `clsH` | Preferred avg-power/avg-HR zone, else the other basis, else effort estimate, else unknown | The build had no effort estimate; it now adopts the existing dashboard heuristic explicitly |

Null is unknown; 0 is a value. In particular NP 0 yields IF/TSS/EF 0 (EF only with
positive HR) and displaces Relative Effort. This fixes the former truthiness
special case of the build normalisation. Duration 0 still yields TSS 0 when NP is known.
HR is ignored when `has_heartrate: false`. EF then also becomes unknown instead of
showing contradictory stored values. VI, decoupling and curves remain sync values.

Zones classify **avg power**, not NP. Both results carry only codes: `zone` and `source`
(`power`, `hr`, `effort`, `none`); `tizBasis` likewise carries its `source` and no label. The ride
module has no localised text: `src/components/ride/ride-presentation.ts` turns these codes into
display text (`rideClassification`, `tizBasisLabel`) for the ride page, the dashboard and the ride
lists. A ride without a name is called `DEFAULT_RIDE_NAME` ("Ride", as in the sync). Effort estimate:
positive Relative Effort / positive hours; <35 → Z1, <70 → Z2, <110 → Z3, else Z4.
0 effort stays unclassified without measurements (existing dashboard rule).
Power and HR zones are those of the athlete state on the ride date, as documented above. E-bikes remain rides, `stats: false` keeps protecting
the existing stats consumers; no special treatment of their measurements.

## Sync contract and time in zones (Refs #7)

`computeMetrics` stores no IF/TSS/Wkg/FTP. `frontmatter` also cleans old
`rec.metrics` (regardless of `source`) via `storedMetrics`; stream NP, curves,
decoupling, HR TIZ and existing calculation timestamps are kept;
summary fallbacks and their derivatives are refreshed based on their individual provenance.
New metrics need no clock; sync timestamps already live under `synced`.
The ride module provides `avg_wkg`/`np_wkg` rounded to two decimals from the
weight on the ride date. The previous dashboard projection stays compatible.

**Measurement gaps in NP/curves (Refs #5/#7):** The existing 1 Hz grid still uses
the right-hand sample for intervals up to 10 s and the first data point.
Only finite, non-negative values count as measured; 0 W stays known. Missing,
negative/NaN values and time gaps >10 s split measurement segments instead of filling
them with 0 W or pushing segments together. Curves use only fully measured
windows. The existing NP minimum length of 60 grid values applies per contiguous
segment; its complete 30 s windows feed into the shared mean of fourth powers.
Short segments yield no NP. Without qualifying windows, summary NP applies, else
unknown/effort. This describes only the observed segments, not an estimated power in
gaps; no coverage threshold or re-fetch is invented. Historical stored NP/curves are
not recomputed retroactively for lack of raw data.

**Decision: new power TIZ in the build.** The sync persists
`power_distribution: { version: 1, method: 'right-sample-dt-0-10s', samples: [[watts, seconds], …] }`.
Nothing is binned or rounded; sorting by watts is deterministic.
Integration matches the previous raw TIZ: right-hand sample for the interval,
0 < dt ≤ 10 seconds, missing/invalid or negative watt values excluded;
0 W is counted. Exact only means exact with respect to this sampling rule, not
knowledge of the continuous signal or of pauses. The build sums these times
with `zoneIdx` into the Coggan zones of the athlete state. History changes need no
rebuild/sync. `tizBasis.power` contains `source: 'distribution'`, `exact: true`,
the date-specific FTP and boundaries. Unknown versions/methods and invalid
distributions are not accepted as exact (fallback legacy, else unknown).
**HR TIZ in the build as well (Refs #51).** The sync persists
`hr_distribution` (bpm → seconds, same version, method and integration rule) instead of
`time_in_hr_zones`, and the build sums it into the HR zones of the athlete state on the ride date
(`tizBasis.hr`: `source: 'distribution'`, `exact: true`, those zones). Rides synced before keep
their stored `time_in_hr_zones` with the sync-day zones from `time_in_hr_zones_basis`
(`source: 'sync'`, else `'legacy'` without zones; `exact: false`); the label says they were
stored at sync. `npm run sync -- --backfill-hr` adds the distribution.

**Legacy is explicitly an exception to the field-free goal, not data loss.**
The existing data contains no raw streams; `public/streams` is downsampled and not an
exact substitute. Existing `time_in_power_zones` are kept byte-/value-identical.
The former `ftp_used` moves exclusively into `time_in_power_zones_basis`:
`{ source: 'legacy', ftp, zones: null, exact: false }`. Old unmigrated files stay
supported. Without an old FTP, it stays unknown too. `tizBasis.power`
flags legacy/missing boundaries; never label them with current/historical boundaries.
`exact: false` means unknown historical validity, not an approximation we computed.
No estimation from charts, no deletion of TIZ.
**TIZ totals** over several rides (dashboard period, year review and its months, zone_time
goals) come from one rule, `tizTotal(rides, basis)` in `src/ride/tiz-total.ts` (exported by the
ride module): seconds per zone (7 power / 5 HR), the rides counted, their `tizBasis`, the rides
per source (`distribution`, `legacy`, `sync`), the legacy count (legacy or unknown boundaries),
`mixed` when the rides don't share one known set of boundaries, the shared `zones` otherwise,
and `exact` only when every ride's TIZ comes from a distribution. Totals may mix legacy and
historically computed zones; they never show shared watt boundaries when `mixed`. The
dashboard notes it on the time-in-zone card, the year review under its yearly time in zone
(`zones.legacyNote`). The ride UI uses the existing `tizBasis` fields from #5.

**Open ticket criterion:** historical power TIZ, and with it the complete removal of
all FTP-dependent frontmatter values, cannot be met for legacy rides without a re-fetch.
A re-fetch is NOT part of the offline rebuild. The explicit command
`npm run sync -- --backfill-power` fetches time/watt streams for legacy rides without
a distribution; `--backfill-hr` does the same with time/heart rate streams for rides with stored HR
TIZ, and both flags together fetch one request per ride (`scripts/sync/lib/backfill.ts`). Ride storage
(`saveDistributions`) replaces only the old TIZ and its basis of each kind
with the distribution in cache and Markdown, using its existing
undo journal. Other metrics, location data, ride body and chart streams are kept.
Successful rides are skipped on resume; without usable measurements
legacy data is kept. The regular API adapter handles rate limits and retries;
`--wait` also waits for the daily limit, `--limit=N` caps the number of fetches.

**Offline rebuild:** `npm run sync:rebuild` (`scripts/sync/strava-rebuild.ts`) imports only ride
storage, ride file and metrics modules, neither auth/geo nor the env loader.
`npm run sync -- --rebuild` is an alias that runs the same script before env loading and
online imports. Summary cache metrics are no longer
deleted wholesale. `currentMetrics` refreshes NP/VI/EF on save and offline rebuild
based on **`metric_sources` per metric**. The global `source: streams`
only means that a time stream was present: HR-only, short/interrupted
watt streams can still use summary NP. New calculations store
`metric_sources.np: streams` only for computable raw NP, otherwise `summary` –
even if the current summary NP is missing. That way later changes, removal,
reappearance and a measured summary 0 stay correctly updatable without a re-fetch.
Genuine stream NP (including 0) is kept. VI and EF carry, where present,
`np+summary`: they use this NP plus the current summary avg watts/avg HR and are
refreshed with these inputs, or removed when inputs are missing.

Legacy without individual provenance is **not guessed**: only a global `source: summary`
is unambiguous and may be refreshed. Legacy with `source: streams` or without a
source stays unchanged, even without a power curve; a curve/distribution does not prove the
provenance of a stored NP. Such NP cannot be safely attributed after the fact without raw
data. No rewrite/backfill of existing data belongs to this fix.
Cache and frontmatter use the same state. Curves, distribution, TIZ/basis,
other provenance entries and timestamps are kept. Ride body and gear custom/body are kept;
offline gear timestamps are stable. Other cache fields may be stale: the known
299 geo deviations are not a #7 migration. With a cache older than the ride files, a rebuild
overwrites the newer Strava and place fields: review the result
([Cache and offline rebuild](sync.md#cache-and-offline-rebuild)).

## Ride storage (Refs #9)

`scripts/sync/lib/ride-storage.ts::createRideStorage({ root, gear })` binds the
gear names once and offers `read(id)`, `list()` (ride records with a summary, newest first),
`save(rec, { streams, streamsAt }?)` and `saveDistributions(id, distributions)`.
Only these write the ride cache/Markdown/chart streams. The ride file itself – path
`<year>/<ride date>_<id>.md`, frontmatter, ride body rule, the targeted metrics patch and the
one frontmatter parser – lives in `scripts/shared/ride-file.ts`, shared by ride storage, the demo
generator and the demo readers; `gear-file.ts` is the separate gear writer.
The gear names come from athlete storage (`scripts/sync/lib/athlete-storage.ts`, below):
`gear().byId` merges athlete gear and gear cache (cache wins); online,
available names from `/athlete` and the gear query are added to the same live map. The list is
collected until then so that `--no-detail --no-streams` also gets complete bike
names. The shared gear context is completed before the first save.
Stored metrics are zone-independent since HR distributions (#51), so ride storage takes no
zones. Weight/historical FTP and zones belong exclusively to the build evaluation.

List, details/streams, sync geo, standalone geo and rebuild use `save`.
Streams stay in memory until the detail fetch succeeds; a detail error
writes neither a chart file nor done flags. After success the cache also contains the
new Markdown path. When the date changes, the existing body is carried over before renaming.
A still empty list body receives the later loaded ride description;
existing user text and intentionally emptied, previously described bodies are kept.
Gear custom/body are kept, rebuild gear timestamps stable. The offline
rebuild now also writes back the cache path, but still needs neither
auth/env nor geo/API. In particular it does not fetch missing chart streams;
missing referenced files are unflagged so that a later online sync
can fetch them again. Legacy TIZ/basis and power distributions are not changed.

**Failure boundary:** one writer per checkout, no parallel sync/geo/rebuild runs.
Before the file changes, `.strava-cache/ride-storage-pending.json` records the previous
file contents. A journal left under the pre-rename name `.strava-cache/fahrt-pending.json`
is recovered the same way on first access. Individual files are replaced via temporary files; on
write/rename errors, changes are rolled back. If the rollback also fails, the
journal is kept, and open/read/list/save must first complete the recovery
or stop with an error. After a process abort, an unfinished
step is rolled back on the next access. No promise of atomic visibility
across multiple files, concurrent writers or power-loss durability (`fsync`
is not implemented). Don't delete the journal manually; fix the error first and
start again. Gear, athlete and list cursor are not part of this journal;
the cursor only advances after successful ride saves.

## Athlete storage

`scripts/sync/lib/athlete-storage.ts::createAthleteStorage({ root, clock })` owns the athlete-side
files next to ride storage: `src/data/athlete.json` (`writeAthlete`, shape `athleteFile`),
`src/data/fitness-history.json` (`recordFitness`: appends FTP/weight only when they differ from
the latest entry, dated with today's local calendar day; shape `historyEntry`),
`.strava-cache/gear.json` (`gear()`: known gear, 7-day TTL for gear details) and
`.strava-cache/state.json` (`listCursor()`: newest/oldest listed activity, history paging, list
complete). The shapes `athleteFile` and `historyEntry` live in `scripts/shared/athlete-file.ts`,
reused by the demo generator. `runSync`
(`scripts/sync/lib/sync.ts`) is a sequence of steps – athlete, activity list, gear, athlete file and
history, details and streams, places – with the Strava client, geocoder and clock injected.

Tests use only synthetic caches under `logs/` or the OS temp folder, the shared Strava fake
(`scripts/sync/lib/strava-fake.ts`), a local geo fake and the actual `runSync` flow. They compare normal output and rebuild,
check the context sources, description/body/date change and injected errors at
stream, Markdown, cache and rename boundaries, including resume.

## Dashboard and goals (Refs #6)

`src/lib/dashboard-payload.ts` is the one seam between the build and the dashboard / ride log
islands (`#dash-data`): `encodeDashboard` on the build side, `decodeDashboard` on the island side,
each the other's inverse, so the round trip is lossless by construction (tested only through these
two functions). The build pages pass the build dataset's rides (every ride: the islands admit rides by the
browser's clock), athlete, today's athlete state and goals;
`use-dashboard.ts` reads the element and runs the dashboard period.
Encoding selects only the required ride fields,
without renaming or computation. No segments/polylines, geo only with place names.
`clsP`/`clsH` contain `zone` and `source`; `src/components/ride/ride-presentation.ts` formats display
text from them. Identical classifications are transferred only once; the exact
default classification `{zone: null, source: 'none'}` is omitted and restored.
`tizBasis` is transferred only for the basis with an existing histogram; unknown boundaries
stay null, known sync boundaries are preserved; its label comes from its `source`. Unknown scalar values
are omitted from the JSON and restored to null by decoding (0 stays 0).
Transport defaults (`stats: true`, `indoor: false`, `pr/ach: 0`, `sport_type: Ride`)
are restored losslessly as well. `avg_wkg` comes ready-made from the ride module;
`kg` is only needed and sent for rides with a power curve.
Decoding restores `d` once and `h` losslessly as `moving_time / 3600`
(unit conversion only, no recomputed training metric). That way the
duration is not transferred twice; the actual start and historical accuracy stay
fully intact. IF/TSS/EF/load and zones are not recomputed.
Sorting/period selection and all card aggregates
live in the pure dashboard period module (Refs #8, `docs/dashboard-period.md`).
The stream count appears once as `streamsCount` in the payload instead of a flag per ride.
`rideChips` formats IF/TSS/EF and the metrics FTP; it does not recompute them.
`rideTimeInZones` reads the final `tizBasis`: #7/#51 raw distributions with date-specific
boundaries/`exact: true`, legacy with `exact: false` and without invented boundaries, and
stored HR sync boundaries. Raw distributions themselves are not sent.
TIZ totals and zone_time goals read the final histograms through `tizTotal`; these
may have different boundaries. The display points this out explicitly.
The stream charts colour power and heart rate by the zones on the ride date (like the route map), never today's.
`evalGoal` reads the flat fields including `d` and excludes `stats: false` itself.
`dashboardFitness` remains the existing adapter for further consumers/regression;
the dashboard period module passes the final `load` directly to the same `fitnessSeries` series.

## Build dataset and page payloads

`src/lib/build-dataset.ts::createBuildDataset(source, { now })` is the one place the build reads its
data from (GLOSSARY "Build dataset"). `source` is a data source adapter: `fileSource()` in
`src/lib/data.ts` reads the synced or the demo data (`selectDataSource`, `astro:content`, the JSON
files in the data folder, chart streams); `memorySource({...})` serves tests with the same shapes,
validated by the content schemas. `now` is the build clock, read once by `getDataset()` in
`src/lib/data.ts` (cached for all pages); no other build module reads the clock.

The dataset owns the demo date shift, the athlete timeline (`athleteAt(date)`, `athleteToday`,
`history`), every ride through the ride module (`rides`, newest first), gear with its totals, goals,
`curveWkg(best)` and the **build calendar** `calendar = { now, today, end, rides, statRides }`
(`rideCalendar`): `rides`/`statRides` are the admitted rides – actual start not in the future –
and `end` is the calendar end. Every build view that counts rides uses the build calendar:
sidebar recent rides, years, year reviews, bikes, segments, performance and the bests on the ride
page. Every ride, admitted or not, still gets its ride page and its route on the map, and the
dashboard payload carries every ride because the islands admit rides again by the browser's clock.
Calendar views end at the calendar end (year review calendar, gear months, performance months); the
running year is the year of the calendar end and compares year to date up to it.

Each page has one payload module of the form `(dataset, params) → payload`, typed against its
island's payload type (`src/lib/*-payload.ts`): `ride-payload.ts` (`RidePayload`),
`gear-payload.ts` (`GearPayload`, `GearDetailPayload`), `segment-payload.ts` (`SegmentsPayload`,
`SegmentPayload`), `performance-payload.ts` (`PerformancePayload`), `year-payload.ts` (`YearsPayload`,
`YearPayload`) and `map-payload.ts` (`MapViewProps` plus the `#map-data` JSON). The dashboard and the
ride log encode the dataset with `encodeDashboard`. The `.astro` pages only call the builder and
render; internal links come from `src/lib/routes.ts`. Payload tests run over the in-memory dataset
(`src/lib/dataset-fixture.ts`).

Types: the build dataset is `BuildDataset` (with `BuildCalendar`, `DatasetGear`, `DataSource`) in
`build-dataset.ts`; its rides are the ride module's `Ride`. A page payload type is declared once, by
the island that renders it (`RidePayload` in `RideView.tsx` …) – the island owns the contract – and
the builder imports it with `import type`. The dashboard payload's types live with its codec in
`dashboard-payload.ts`: `DashboardRide` (what `decodeDashboard` returns, assignable to the dashboard
period's `PeriodRide`) and `DecodedPeriod` (the islands' `D`). The content schemas' parsed entries are
checked against `RideFrontmatter` and `GearFrontmatter` at compile time (`src/content-schemas.ts`).
`npm run typecheck` checks all of it.
