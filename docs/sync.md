# How the sync works

The sync reads your activities from the Strava API and writes them to local files that the Astro build turns into pages. Setup and the everyday commands are in the [README](../README.md#quick-start); this page covers the internals. Field-level details of the ride data: [`ride.md`](ride.md).

## What gets written

```
src/content/rides/<year>/<date>_<id>.md   one file per ride: all Strava fields + derived metrics in the frontmatter
src/content/gear/<id>.md                  one file per bike or pair of shoes (+ your own custom: block)
public/streams/<id>.json                  compacted second-by-second data for charts and route maps
src/data/athlete.json                     profile, zones, FTP, gear
src/data/fitness-history.json             FTP and weight history (the sync appends changes, you add tests)
src/data/geo-cells.json                   place cache (grid cell → place)
.strava-cache/activities/                 API cache for offline rebuilds
```

All of these stay local and are ignored by Git ([why](../README.md#your-data-stays-local)).

## A sync run

- **List:** new activities since the last run, plus your complete history on the first run.
- **Per ride:** streams (second-by-second data) and details (laps, segments, splits, description, calories, device).
- **Stored by the sync:** Normalized Power, Variability Index, Efficiency Factor, aerobic decoupling, power curve (1 s to 3 h) and heart rate curve. Instead of frozen time in zones, the sync stores two zone-independent, time-weighted distributions: the power distribution (uncompacted watt values, seconds per value) and the HR distribution (bpm values, seconds per value).
- **Computed at build time:** IF, TSS, W/kg and power and heart rate time in zones come from the athlete state on the ride date (FTP and weight from `fitness-history.json`, zones from `zones.json` or Strava, see the [README](../README.md#configuration)). From a stored distribution, time in zones is exact with respect to the raw sampling: right-hand sample, only intervals above 0 up to 10 s, no interpolation across pauses. Edits to the history or the zones take effect with the next `npm run build`, without a new sync.

## Flags

Pass flags after `--`, e.g. `npm run sync -- --limit=10`.

| Flag | Effect |
|---|---|
| `--wait` | Wait out the daily rate limit instead of stopping (this is what `npm run sync:all` does) |
| `--limit=<n>` | Process at most `n` rides in this run |
| `--no-detail` | Skip ride details (laps, segments, splits, …) |
| `--no-streams` | Skip streams |
| `--no-geo` | Skip looking up places |
| `--backfill-power` | Only backfill power distributions for older rides, see [Power and HR backfill](#power-and-hr-backfill) |
| `--backfill-hr` | Only backfill HR distributions for older rides, see [Power and HR backfill](#power-and-hr-backfill) |
| `--rebuild` | Alias of `npm run sync:rebuild`: only the offline rebuild runs, see [Cache and offline rebuild](#cache-and-offline-rebuild) |

## Rate limits

By default Strava allows 100 read requests per 15 minutes and 1,000 per day; some applications get more. The sync reads the actual limits from Strava's response headers, pauses automatically when the 15-minute window is used up, processes the **newest rides first**, and continues exactly where it stopped on the next run. Without `--wait` it stops at the daily limit; with `--wait` it sleeps until the limit resets.

## Cache and offline rebuild

`.strava-cache/activities` holds the summary, details and derived stream data of every ride, but **no raw streams**.

`npm run sync:rebuild` rewrites every ride file from that cache. It is fully offline: no environment or token loading, no API calls, no geocoding. Use it after changes to how ride files are written.

- Old stored IF/TSS/W/kg values are removed from the files; these are computed at build time now.
- Metrics that don't depend on FTP or weight, and stored time in zones (see below), are kept.
- Existing ride bodies, the gear `custom:` block and gear bodies are kept; gear timestamps don't change offline.
- All other Strava and place fields are overwritten from the cache. If your cache is older than your ride files, review the diff of your ride files before relying on the result.

## Legacy time in zones

Older versions of the sync stored no raw power or heart rate data, only finished zone histograms. Those histograms stay unchanged: power with the FTP used at sync time stored separately and the zone bounds unknown, heart rate with the Strava HR zones of the sync day (where known). They are **not** a retroactively corrected historical time in zones, so your zones file does not apply to them; the ride page labels them as stored at sync. The compacted `public/streams` files are not precise enough to recompute them, and a rebuild cannot recover data that was never stored. Exact historical zones for these rides need fresh data from Strava: see the next section.

## Power and HR backfill

```bash
npm run sync -- --backfill-power                # power distributions
npm run sync -- --backfill-hr                   # HR distributions
npm run sync -- --backfill-power --backfill-hr  # both, one request per ride
```

A targeted run that fetches only the time stream plus the watt and/or heart rate stream for older rides that still have stored time in zones instead of a distribution. Each successful ride is saved to the cache and its Markdown file immediately, replacing the stored time in zones, and skipped on the next run.

- `--limit=10` caps the number of rides, `--wait` keeps going past the daily rate limit.
- Rides without retrievable power or heart rate data keep their previous zone times and are reported as open.
- Other ride fields and chart streams stay unchanged; athlete, gear and places are not updated.
- `npm run sync:rebuild` never starts a backfill.

## Places and countries

Strava provides no usable place names, so Casquette looks them up itself via reverse geocoding with OpenStreetMap [Nominatim](https://nominatim.org) (free, no API key).

- Each route is sampled about every kilometre and rounded to a grid of roughly 1.5 km. Only the centres of these grid cells are sent to Nominatim: no times, no ride data.
- Every grid cell is looked up exactly once and stored in `src/data/geo-cells.json`. That file stays local because it reveals every place you have ridden through. Delete it and all cells have to be looked up again.
- Nominatim allows one request per second ([usage policy](https://operations.osmfoundation.org/policies/nominatim/)). A few thousand cells take about an hour.
- Every sync looks up the missing cells at the end. `npm run sync:all` (`--wait`, the first full sync) resolves all of them; a plain `npm run sync` spends at most 15 minutes and leaves the rest for the next run. `GEO_BUDGET_MIN` sets the limit for both explicitly (`0` = no limit). `--no-geo` turns places off.
- **`npm run geo`** looks up all missing cells without any Strava requests and without a time limit. You can stop it at any time and it resumes where it left off. Use it when you skipped places during syncs, or after switching `GEO_LANG` (see below).
- Results go into the `geo:` block of each ride's frontmatter (start, country, region, all places along the route). They show up on the ride page, in the place explorer on the map and in the ride log search.
- Indoor and virtual rides (Zwift and similar) are skipped.

| Variable | Default | Purpose |
|---|---|---|
| `GEO_LANG` | `en` | Language of the place names Nominatim returns (e.g. `de`, `fr`) |
| `NOMINATIM_URL` | public OpenStreetMap endpoint | Use your own Nominatim instance |
| `NOMINATIM_UA` | `casquette/0.1 (self-hosted training dashboard)` | User agent sent to Nominatim; the usage policy requires one that identifies the application |

Keep `GEO_LANG` stable once `src/data/geo-cells.json` is filled. Cells that are already cached are never looked up again, so changing the language later mixes old and new place names. To switch completely, delete `geo-cells.json` and run `npm run geo` again.
