---
status: accepted
---

# Zones at build time: zones file and HR distribution

Riders want their own zones (#51): heart-rate zones that changed over time, and power zones with other bounds than Coggan. Power zones were already applied at build time, from the stored power distribution and the FTP on the ride date. Heart-rate time in zones was not: the sync stored a finished histogram per ride, computed against the Strava HR zones of the sync day. Changing zones would have needed a new sync of every ride.

We decided:

- **Zones live in an optional personal file**, `src/data/zones.json` (gitignored, like the goals): HR zones as lower bounds in bpm, each entry optionally valid from a date, and power zone bounds in % of FTP instead of Coggan. The athlete state resolves zones per date: HR from the file, else Strava, else the default HR zones; power from the file's bounds, else Coggan – both from the FTP on the date. It also reports the source, which the Zones card shows. Unlike the other `*.example.json` files, `zones.example.json` is **not** a fallback, only documentation: without `zones.json` nothing changes. An invalid file fails the build rather than being ignored.
- **The sync stores an HR distribution instead of HR time in zones.** `hr_distribution` is the HR counterpart of the power distribution (bpm → seconds, same version, method and integration rule), so the build computes HR time in zones for any zones. Stored metrics are now fully zone-independent; changing the zones file needs only `npm run build`.
- **Older rides keep their stored HR time in zones** and are labelled as stored at sync, with the sync-day zones where known. `npm run sync -- --backfill-hr` re-fetches time and heart-rate streams to add the distribution, replacing the stored histogram; it shares one request per ride with `--backfill-power`.

## Considered options

- **Keep HR time in zones frozen, re-sync on zone changes.** Rejected: thousands of API calls under Strava's daily limit for a configuration change.
- **Store both the HR distribution and the histogram.** Rejected: two sources of truth that disagree as soon as zones change.
- **Absolute watt bounds for custom power zones.** Rejected: they would stop following the FTP history; bounds in % of FTP keep power zones historically correct.
- **Use the example file as a fallback, as for goals.** Rejected: any example zones would silently replace the rider's Strava zones.

## Consequences

- Ride files grow by about one line per distinct bpm value of a ride.
- The demo ships `demo/data/zones.json` (dated HR zones, Coggan power) and HR distributions, so the demo shows the file source deterministically.
- Mixed periods (rides with distribution and rides with stored HR time in zones) can carry different HR zone bounds; the dashboard already flags mixed bounds.
