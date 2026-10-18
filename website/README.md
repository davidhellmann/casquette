# Website

The promo one-pager for Casquette: plain HTML, CSS and JS, no build needed to look at it. `index.html` is the page, `site.css` and `site.js` its style and behaviour, `fonts/` the self-hosted fonts, `ui/` real UI fragments of the demo build (generated, see [`ui/README.md`](ui/README.md)). Browser test: `npm run test:website`.

## Legal pages and analytics

`legal-notice.html` and `privacy-policy.html` are **templates**. Every personal detail is a placeholder in double braces, such as `{{SITE_LEGAL_NAME}}`, so nothing personal is ever committed. Opened straight from this folder they show the placeholders. The deploy fills them with `npm run site:build`.

```bash
SITE_LEGAL_NAME="Jane Rider" \
SITE_LEGAL_ADDRESS="Example Street 1|1234 Sample Town" \
SITE_LEGAL_COUNTRY="Austria" \
SITE_LEGAL_EMAIL="jane@example.com" \
SITE_CABIN_HOST="scripts.withcabin.com" \
npm run site:build                      # → dist-site/
```

| Variable | Required | What |
|---|---|---|
| `SITE_LEGAL_NAME` | yes | Media owner, operator and data controller |
| `SITE_LEGAL_ADDRESS` | yes | Postal address, lines separated by `\|` or new lines |
| `SITE_LEGAL_COUNTRY` | yes | Country, the last address line |
| `SITE_LEGAL_EMAIL` | yes | Contact email, shown as a plain `mailto:` link |
| `SITE_CABIN_HOST` | no | Host of the [Cabin](https://withcabin.com) script: `scripts.withcabin.com`, or a custom subdomain such as `cabin.example.com` (bare host, no `https://`) |

What the build does:

- It copies this folder to `dist-site/` (`--out <dir>` for another folder; it is emptied first). This README is left out.
- It fills the placeholders in every HTML file, escaped as HTML.
- With `SITE_CABIN_HOST` set, it adds `<script async defer src="https://<host>/hello.js">` before `</body>` of every page and keeps the Cabin sections of the privacy policy (the parts marked `if:cabin` … `end:cabin`). Without it, there is no script and no Cabin section.
- It fails, and writes nothing, when a legal variable is missing or invalid. It also fails when any `{{…}}` is left in a page.
- `--demo <dir>` copies a demo build into `<out>/demo/` and injects Cabin into its pages as well.

It reads only the process environment, never a `.env` file. Values are public once deployed, but keep them out of the repository: set them as repository variables of the deploy.

The custom events Cabin counts are the `data-cabin-event` attributes in `index.html`: *See the demo*, *Open GitHub*, *Copy clone command*, *Copy demo command*, *Copy connect command* and *Copy sync command*. The privacy policy lists the same names; a unit test (`scripts/site/lib/site-template.test.js`) checks that both agree. When you add an event, add it to the policy too. Keep the names fixed and free of personal data.

### In the deploy (#54)

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) runs on every push to `main` (and by hand: *Actions → Pages → Run workflow*). It builds the demo, checks it and assembles the artifact:

```bash
DATA_SOURCE=demo PUBLIC_LEGAL_URL=https://casquette.es/ npx astro build --base /demo/ --outDir dist-demo
npm run demo:check -- dist-demo --base /demo/   # fails on anything but demo data, or links outside /demo/
npm run site:build -- --demo dist-demo   # SITE_* from repository variables → dist-site/ (+ dist-site/demo/)
```

`dist-site/` is the artifact. `PUBLIC_LEGAL_URL` (the site's origin) gives the demo its links back to the legal pages. The app's sidebar then shows "Legal notice · Privacy policy". Without it, nothing is shown, so self-hosted copies stay clean.

Repository variables (*Settings → Secrets and variables → Actions → Variables*): the `SITE_*` variables above, and `PAGES_DOMAIN` for a custom domain (`casquette.es`). With it, the website is served at `https://<domain>/` and the demo at `/demo/`. Without it, the deploy falls back to `https://<owner>.github.io/<repo>/` and derives the paths from that (base path `/<repo>/demo/`), so a fork deploys too once it sets its own `SITE_LEGAL_*`.

One-time setup on GitHub (owner):

- *Settings → Pages*: source **GitHub Actions**; custom domain `casquette.es`; **Enforce HTTPS** once the certificate is there. A deploy from Actions ignores a `CNAME` file, so the domain is set here, not in the artifact.
- DNS: `A` records for the apex to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (optionally `AAAA` to `2606:50c0:8000::153` … `2606:50c0:8003::153`), and `www` as a `CNAME` to `<owner>.github.io`, so GitHub redirects it to the apex.
- Verify the domain in the account settings (*Settings → Pages → Add a domain*, a `TXT` record), so no other account can claim it.

Keep the privacy policy in step with what the site and the demo do: their `localStorage` keys and third-party requests (only the OpenStreetMap tiles on the demo's maps).

## Social image

`og.png` (1200 × 630) shows the real dashboard fragment next to the headline, in the website's dark theme. `npm run og` renders it from `scripts/site/og/template.html` (run `npm run fragments` first when the app changed). The meta tags in `index.html` point to it with absolute URLs on https://casquette.es/.

