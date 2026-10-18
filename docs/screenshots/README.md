# Product screenshots

Marketing screenshots for the README and the website, taken from the demo dataset (`demo/`). They contain no personal data. The demo routes follow real roads; map tiles and route geometry © OpenStreetMap contributors (ODbL).

| View | Page and framing |
|---|---|
| `dashboard` | Dashboard, top: sidebar, period controls, key figure cards, fitness chart |
| `ride` | Ride detail of the newest outdoor ride with route, power and heart rate, top: route map and key data |
| `ride-charts` | Same ride, scrolled to the streams card (power, heart rate, cadence, speed, elevation) and time in zones |
| `map` | Route map with filters and places panel |
| `year` | Year review of the last complete year, top: key figures, months, at a glance |
| `performance` | Performance, top: FTP and best effort cards, FTP and estimated FTP chart |
| `zones` | Dashboard, scrolled to the intensity section (weekly volume by zone, time by zone, time in zone, rhythm) |

- Each view in light and dark (`<view>-light.webp`, `<view>-dark.webp`), theme from `prefers-color-scheme`
- Viewport 1440×900 at 2× (2880×1800 px), WebP quality 80, default period (30 days, power), sidebar expanded
- The "Demo data" entry in the sidebar is hidden; everything else is the app as built

## Regenerate

```sh
npm run build && npm run preview   # demo mode: no rides under src/content/rides/
npm run screenshots                # overwrites docs/screenshots/*.webp
```

- `--url <preview URL>` if the preview server isn't on `http://localhost:4321` (`npm run screenshots -- --url http://localhost:4322`)
- `--only <view>` to retake one view, e.g. `npm run screenshots -- --only map`
- Needs a Chromium-based browser. If none is found, set `CHROME_PATH` to its binary.
- With your own rides synced, build the demo explicitly and serve it in the foreground (`astro preview` detaches when not run in a terminal):
  ```sh
  DATA_SOURCE=demo npx astro build --outDir dist-e2e
  PORT=4399 node e2e/serve.ts       # terminal 1
  npm run screenshots -- --url http://localhost:4399
  ```

The script (`scripts/site/screenshots.ts`) refuses to run unless the page shows the demo indicator (`[data-demo-note]`), so real data can never end up in a screenshot. Before capturing it waits for fonts, hydrated React islands, the drawn charts and OpenStreetMap tiles, then waits a moment for late layout (responsive charts re-measuring, Leaflet's tile fade-in – the charts themselves don't animate), so it needs network access. Browser, privacy guard and readiness are shared with the UI fragments (`scripts/site/lib/capture.ts`). Views and framing live in `scripts/site/lib/screenshots.ts`: close-ups scroll to a `data-testid` hook (`ride-streams`, `dash-intensity`). The ride and the year are picked from the demo dataset as the preview shows it – its dates moved forward to today (`scripts/site/lib/demo-dataset.ts`).

The website shows real UI instead of these screenshots: static fragments of the demo build (`npm run fragments`), see [`website/ui/README.md`](../../website/ui/README.md).
