# Casquette

A personal Strava training dashboard: rides synced from Strava, evaluated against the athlete's history and shown as static pages. Code, docs and UI use exactly these terms.

## Language

### Rides

**Ride**:
Any Strava activity of a cycling sport type (`…Ride`, velomobile, handcycle), including e-bike and e-MTB rides. Every ride has a ride page and appears on the map.
_Avoid_: activity (that is the raw Strava record), trip, workout

**Ride type**:
The classification of a Strava sport type as ride or not, and as e-bike or not.
_Avoid_: sport category, activity type

**Stat ride**:
A human-powered ride, i.e. every ride except e-bike/e-MTB rides. Only stat rides count in totals, goals, load, fitness/fatigue, power curves, records, year reviews, bike and segment stats.
_Avoid_: counted ride, real ride

**E-bike ride**:
A ride with an e-bike or e-MTB sport type; shown in the ride log and on the map, flagged, but excluded from all stats.
_Avoid_: assisted ride

**Ride date**:
The local calendar day of a ride, taken from its written local start time, never converted into another time zone.
_Avoid_: ride day

**Actual start**:
The real instant a ride started; it alone decides whether a ride already happened.
_Avoid_: start date (ambiguous with ride date)

**Ride log**:
The searchable, sortable list of all rides, including e-bike rides.
_Avoid_: logbook, activity list

**Ride page**:
The detail page of a single ride.
_Avoid_: activity page

**Ride classification**:
The zone a ride falls into by its average power or average heart rate, with the source that decided it (power, HR, effort estimate or none).
_Avoid_: ride zone, intensity

**Effort estimate**:
A fallback ride classification from Relative Effort per hour when neither power nor heart rate is available.
_Avoid_: guessed zone

**Ride body**:
The free Markdown text below a ride's frontmatter; the Strava description or the user's own notes.
_Avoid_: notes field

### Athlete

**Athlete**:
The one person whose Strava account is synced, with profile, gear and current zones.
_Avoid_: user, rider

**Athlete history**:
Dated entries of FTP and body weight.
_Avoid_: fitness history (that is CTL/ATL), timeline

**Athlete state**:
FTP, body weight and zones that apply on a given date, derived from the athlete history and the zones file. Values are carried forward from the last entry on or before the date.
_Avoid_: athlete snapshot, profile, settings

**Today's athlete state**:
The athlete state at build time.
_Avoid_: current FTP (when weight and zones are meant too)

### Zones

**Zones**:
Intensity ranges per basis: 7 power zones (derived from FTP) and 5 HR zones. The top zone is open-ended; values below Z1 count as Z1.
_Avoid_: levels, bands

**Power zones**:
The 7 zones derived from the FTP of an athlete state: Coggan, or the bounds in % of FTP from the zones file.
_Avoid_: watt zones

**HR zones**:
The 5 heart-rate zones valid on a date: from the zones file, otherwise from Strava, otherwise the default HR zones.
_Avoid_: pulse zones

**Zones file**:
The rider's optional `zones.json`: HR zones, each optionally valid from a date, and power zone bounds in % of FTP. Its example only documents the format; without the file, zones come from Strava and Coggan.
_Avoid_: zone settings, zone config

**Zone assignment**:
The zone a value (watts, bpm) falls into: the highest zone whose lower bound it reaches.
_Avoid_: bucketing

**Default zones**:
The zones used without athlete data: FTP 200 W with Coggan power zones, and HR zones 0–129 / 130–149 / 150–164 / 165–179 / ≥ 180 bpm.
_Avoid_: fallback zones

**Basis**:
Which measurement a view evaluates: power or heart rate.
_Avoid_: mode, metric type

**Time in zones (TIZ)**:
Seconds spent per zone, from a ride's power or HR distribution with the zones on the ride date, otherwise as stored at sync.
_Avoid_: zone time, zone histogram

**TIZ total**:
The TIZ of a set of rides summed per basis, with the rides per source, the legacy count and whether their zone boundaries are mixed; mixed totals have no shared boundaries.
_Avoid_: zone totals, exact TIZ

**Legacy TIZ**:
TIZ stored at sync before distributions existed: power TIZ with unknown zone boundaries, HR TIZ with the HR zones of the sync day. It is never shown as historically corrected and the zones file does not apply to it.
_Avoid_: old zones, estimated TIZ

### Metrics

**Metric**:
A derived number describing a ride (NP, IF, TSS, EF, VI, decoupling, W/kg …).
_Avoid_: stat, KPI (KPI is a dashboard tile)

**NP (Normalized Power)**:
Stored normalised stream power, otherwise the measured weighted average power from Strava; never replaced by average power.
_Avoid_: weighted power

**IF (Intensity Factor)**:
NP divided by the FTP on the ride date; unknown without NP.
_Avoid_: intensity

**TSS (Training Stress Score)**:
Rounded riding hours × IF² × 100; unknown without NP.
_Avoid_: stress

**EF (Efficiency Factor)**:
NP divided by a positive average heart rate; unknown without NP or HR.
_Avoid_: efficiency

**Decoupling**:
How much the power-to-heart-rate ratio drops from the first to the second half of a ride, in percent.
_Avoid_: drift, cardiac drift

**Load**:
TSS, otherwise Relative Effort, otherwise 0; a known 0 TSS is never replaced. The basis for fitness and fatigue.
_Avoid_: training load (when a single ride is meant), stress

**Fitness (CTL)**, **Fatigue (ATL)**, **Form (TSB)**:
Long-term (42-day) and short-term (7-day) exponentially weighted load; form is fitness minus fatigue as of the previous day.
_Avoid_: freshness, readiness

**Power distribution**:
FTP-independent pairs of watts and seconds, sorted by watts, from unreduced streams. It is enough to compute historical power TIZ but cannot reconstruct the ride over time.
_Avoid_: power histogram (that is binned)

**HR distribution**:
FTP- and zone-independent pairs of bpm and seconds, sorted by bpm, from unreduced streams; the heart-rate counterpart of the power distribution.
_Avoid_: HR histogram

**Power curve**:
The best average power per duration of a ride.
_Avoid_: power profile, MMP chart

**Best curve**:
The best power per duration across a set of rides, with the ride each best came from.
_Avoid_: all-time curve

**New power best**:
A duration of a ride's power curve at which the ride currently holds the all-time best: strictly above the best curve of every other stat ride, earlier and later. It is a current fact, not a historical one, so it disappears when a later ride beats it.
_Avoid_: PR (that is Strava's per-segment achievement), new record

**Estimated FTP**:
95 % of the best 20-minute power in the period.
_Avoid_: predicted FTP

**Records**:
The positive bests across stat rides: longest distance and time, most climbing, fastest outdoor ride (from 30 minutes), best NP (from 20 minutes), highest load, most PRs, highest max HR. Ties go to the more recent ride (later actual start).
_Avoid_: PRs (that is Strava's per-segment achievement)

### Recommendations

**Recommendations**:
Pure coaching rules that turn metrics into status codes: FTP recommendation, decoupling status and daily needs.
_Avoid_: tips, advice

**FTP recommendation**:
Whether the estimated FTP is clearly above the athlete's FTP (time for a test) or clearly below it.
_Avoid_: FTP alert

**Daily needs**:
The athlete's daily carbohydrate, protein, fat and water needs per kg body weight, scaled by the average daily training time in the period.
_Avoid_: diet, nutrition plan

**Fueling**:
The carbohydrate and fluid recommendation for a ride, from its duration and intensity (Z3 and above = intense).
_Avoid_: nutrition (reserved for daily needs factors), feeding

### Dashboard

**Period**:
A selection of 7/14/30/90/365 local calendar days up to and including the calendar end, or all time. Only rides whose actual start is not in the future count.
_Avoid_: range, window, timeframe

**Dashboard period**:
All dashboard card results for one period and basis.
_Avoid_: dashboard state, filter

**All time**:
The period from the first stat ride's date to the calendar end; it has no previous period.
_Avoid_: lifetime, total

**Previous period**:
The same number of calendar days directly before the selected period.
_Avoid_: last period, comparison period

**Halves**:
The selected period split into an earlier and a later part for comparison; independent of the previous period.
_Avoid_: split

**Calendar end**:
The later of today and the latest ride date of an admitted stat ride; the single upper bound for all calendar views.
_Avoid_: end date, today

**Calendar day**:
A local wall-clock date, never converted into another time zone.
_Avoid_: UTC day

**Year to date**:
A year's stat rides up to a calendar day, compared with the previous year up to the same date (same month and day; 29 February compares with 28 February).
_Avoid_: same day number, YTD ordinal

**Training calendar**:
Stat rides laid out per calendar day in whole weeks, each ride day with a level 1–4 by the quartiles of its load (dashboard, last 52 weeks) or kilometres (year review).
_Avoid_: activity calendar (`heatmap` is only the dashboard's code name for it)

**Streak**:
Consecutive calendar days with a stat ride (longest and current) or consecutive weeks with one.
_Avoid_: run, chain

**Form status**:
The fitness/fatigue/form verdict shown for today.
_Avoid_: readiness

**Goal**:
A target for distance, time, elevation, ride count, TSS, long rides or zone time over a week, month or year.
_Avoid_: target, objective

**Year review**:
The page summarising one calendar year of stat rides.
_Avoid_: annual report

### Gear and segments

**Gear**:
A bike or pair of shoes from Strava, with optional custom data such as its price.
_Avoid_: equipment

**Bike**:
Gear used on rides; its distance counts only synced stat rides.
_Avoid_: wheel, cycle

**Garage**:
The dashboard overview of all bikes with distance, cost per km and ranking.
_Avoid_: fleet

**Segment**:
A Strava segment ridden at least twice, with its efforts across rides.
_Avoid_: climb, section

### Sync

**Sync**:
Fetching rides, athlete data and streams from Strava into local files.
_Avoid_: import, download

**Rebuild**:
Regenerating all ride files from the local activity cache, offline, without Strava or geocoding.
_Avoid_: resync, refresh

**Power backfill**, **HR backfill**:
Re-fetching time/watt or time/heart-rate streams for rides with legacy TIZ so they gain a power or HR distribution.
_Avoid_: migration

**Activity cache**:
The local copy of Strava summaries, details and derived stream data per ride; it holds no raw streams.
_Avoid_: raw cache, database

**Streams**:
Strava's second-by-second measurements of a ride (time, watts, heart rate, GPS …).
_Avoid_: samples, tracks

**Chart streams**:
Downsampled streams kept for the ride page charts; not an exact substitute for raw streams.
_Avoid_: stream files

**Summary fallback**:
A metric taken from Strava's activity summary because streams could not provide it.
_Avoid_: estimate

**Ride storage**:
The single place where the sync reads and writes ride files: activity cache, ride Markdown and chart streams, guarded by an undo journal.
_Avoid_: ride store, repository, writer

**Demo data**:
The synthetic, seeded dataset in `demo/` (rides, gear, chart streams, athlete, goals, FTP/weight history, zones file) shown while no synced ride exists. A fictional "travelling rider" rides real roads in five cities; the road geometry is cached in `demo/source/routes/` (OpenStreetMap data, ODbL). Real data and demo data are never mixed: one synced ride switches the whole site to real data. Demo dates move forward in whole weeks so the newest demo ride is recent. The sync never touches it.
_Avoid_: sample data, fixtures, example data (the `*.example.json` fallbacks are something else)
