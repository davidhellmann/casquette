# Changelog

All notable changes to Casquette. Versioning: [README → Versioning](README.md#versioning).

## 1.0.0 – 2026-10-19

First public release.

### Dashboard and pages

- **Dashboard** for a period of 7, 14, 30, 90 or 365 days or all time, on power or heart rate: key figures against the previous period, fitness, fatigue and form, a 52-week training calendar, goals, zones and intensity, power curve, ride analysis, records, fuelling and daily needs.
- **Rides:** a searchable, sortable ride log, and a page per ride with the route map, zone-coloured streams, time in zones, power curve, laps, segments and splits.
- **Years:** all years compared, plus a review per year.
- **Map:** a heatmap of all outdoor routes, with places by country, region and town.
- **Segments, Performance and Gear:** segment attempts and PRs, FTP history and best efforts, bikes with distance, records and cost per km.
- Light, dark and system theme; keyboard and screen reader friendly.

### Data

- **Sync from Strava** (`npm run sync`, `npm run sync:all`): handles the rate limits, resumes where it stopped, and stores every ride as a Markdown file. It can rebuild everything offline from its cache (`npm run sync:rebuild`).
- **Zones on the ride date:** power and heart-rate zones from the FTP history and an optional zones file, applied at build time.
- **Place names** via OpenStreetMap Nominatim. The first full sync resolves all of them.
- **Your data stays local:** nothing personal is committed, and the site is fully static.
- **Demo data:** a synthetic demo dataset ships with the repository, so you can try everything without a Strava account.

### Requirements

- Node.js 22.18 or newer.
- A Strava subscription to sync your own rides.
