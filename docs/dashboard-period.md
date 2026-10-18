# Dashboard period (Refs #8)

Terms follow `GLOSSARY.md`. Code identifiers below are quoted as they currently exist; the
planned English names are listed in `docs/adr/0001-english-domain-language.md`.

`src/dashboard-period/index.js::dashboardPeriod(rides, { days, basis, now, gear?, athleteState? })`
is the pure entry point for the dashboard cards. `rides` are **final, flat rides**
from the ride module or `hydrateRides`, including `d`, `stats`, `h`, `load`,
`clsP`/`clsH`, historical W/kg and TIZ with metadata. `days`: 7/14/30/90/365/0 (`RANGES`);
`basis`: `power`/`hr`; `now`: a valid, explicit Date. Invalid options are
rejected. Optional `gear` provides the garage, not training metrics. Optional `athleteState`
is the already resolved athlete state for today, used for daily needs and the FTP test hint;
without it daily needs are unknown and the FTP recommendation is neutral.
No clock, DOM, I/O, hidden state or mutation of the inputs.

## Result and responsibilities

- Period bounds, sorted stat rides, ride log, previous period and `hasPrevious`.
- `S`: KPIs, time-weighted averages, previous-period/half deltas, 80/20,
  zone times, form status, EF third trend and rolling 5-ride average,
  power curves and 20-minute FTP estimate. `sparks`: twelve ready-made KPI buckets.
- `fitness`/`pmc`/`load`: all-time/period history, ramp rate, ACWR, rest/load series
  and status codes. `fitnessSeries` stays the only CTL/ATL rule; the final load
  is passed in. TSB stays, as before, the form of the previous day.
- `weekly`, `rhythm`, `powerHr`, `curves`: week/month buckets, weekdays,
  start hours, indoor/outdoor, ordered plot rides, curve durations and historical
  W/kg of the respective best's origin. `bestCurve` stays the shared rule.
- `tiz`/`rideTiz`: totals, Z2 shares and preserved sources/boundaries, no recomputation
  from current zones. Different or unknown boundaries → no shared
  boundary. `exact` only with exclusively explicitly exact sources; legacy stays
  unverified as before. **#7 legacy exactness is still open.**
- `dailyNeeds`, `ftpRecommendation`, `decoupling`: ready-made daily needs and
  recommendation codes from pure training rules (existing thresholds .9/1.03 and 5/10).
  The renderer only picks text/colour and rounds for display; meter/SVG geometry
  stays there.
- `records`, `nutrition`, `fueling`: record rides, daily needs factors,
  carb/fluid totals and recommendations per ride; `fuel`/`fuelCell` are shared.
- `history`, `heatmap`, `gearKm`, `garage`: years/YTD/cumulative, all-time,
  calendar cells/quantiles/streaks and gear totals. Garage (`statsDistance`) like the
  bike pages (`kmTotal`), cost/km and ranking exclusively from synced
  stat rides. Raw Strava distance is no substitute; `loadGear.stravaKm` names
  it separately (for the unchanged shoe display).

The React dashboard (`src/components/dashboard/`, island `DashboardView`) renders these results:
thin pure `*-data.js` modules per card group turn them into display values, the components draw them.
Display units, number rounding, text/colours, SVG geometry, chart decimation and
table search/sorting stay presentation. Athlete FTP/weight for current
reference lines stay build data; daily needs are scaled in the pure module.
Goals still delegate to `evalGoal`, now with the same explicit clock.

## Bounds, deliberately kept rules and corrections

- Local calendar days: N days including the shared calendar end;
  previous period the N days directly before, lower bound inclusive, upper bound exclusive.
  `today` stays the browser calendar day, `now` the actual instant.
  `calendarEnd` is max(today, local days of the admitted stat rides).
  This single bound drives windows/denominators, fitness/load, weeks/months, sparks,
  YTD/cumulative and heatmap including streaks. E-bikes don't move it.
  Goals (week/month/year) and build performance use the same `rideCalendar` rule.
  On a local week/year change, the new goal period starts accordingly;
  older rides stay in the locally assigned previous period/history. Goal pace
  still uses now, or, for an already admitted later calendar day, at the
  earliest its midnight. Actual future rides are also excluded directly in goals,
  not only by the dashboard caller. The current period counts only
  actual starts (`start`, Unix milliseconds from `start_date`) **up to and including
  now**; a ride later on the same day does not count. Local ride time is not an actual
  instant: completed trips east/west of the browser stay visible.
  Calendar assignment, day bounds and rhythm independently use `start_local`
  (details and legacy fallback in `docs/ride.md`).
  This fixes the former unbounded inclusion of future rides in KPIs,
  heatmap, records, curves and history; a regression test exists.
- All time starts at the earliest **stat** ride day, regardless of input order.
  No previous period. Empty stats: one calendar day, defined 0/null results.
  E-bikes change neither the denominator nor the start of history; the all-time ride log
  also keeps older e-bike rides. Finite periods show them in the normal window.
- Calendar distances and day-of-year indices use date components instead of
  elapsed 24-hour blocks. So DST no longer shifts cumulative kilometres
  or YTD bounds. Tests cover both clock changes and the leap day.
  The existing year comparison stays ordinal (day 1 … 366, reference year 2024),
  not same-month/same-day between leap and normal years.
- Halves keep the previous split: first half `floor(days / 2)` full
  calendar days, second half the rest. All time also has halves, just no previous period.
  The EF trend compares, as before, the first/last third of the available EF rides.
- Null is unknown; 0 stays known in weighted averages/load/EF. A known load
  of 0 is never replaced by effort. The power KPI shows W/kg even at 0 W instead of
  a misleading "no power data". Without historical weight, curve W/kg stays null.
- 80/20 uses the final avg ride classification, not TIZ: unknown time separately,
  fallbacks from the ride module unchanged. Z1–2 easy, Z4+ hard; HR can, as before,
  carry higher zones through the power fallback. No repeated FTP classification.
- Records stay positive bests; NP only from 20 minutes, outdoor speed only from
  30 minutes. On a tie, the more recent ride wins (stable order).
  The 52-week heatmap still spans 53 calendar weeks and the previous /52 denominator.

## Regression and evidence

`src/dashboard-period/fixtures.js` generates synthetic final rides with two
FTP/weight states, legacy TIZ, 0/null and an e-bike. `legacy-results.json` contains
the original results isolated before migration from `a0d6b7e:src/scripts/dashboard.js`
for all 5 × 2 options (KPIs, halves, zones, curves, fitness).
`legacy-cards.json` records the original fueling/load panel for both bases.
Date serialisation of the capture time zone is skipped in the comparison; day keys
stay exactly checked. New tests address the public interface only.
Local red test runs and reproduction scripts live gitignored under `logs/impl/`.
