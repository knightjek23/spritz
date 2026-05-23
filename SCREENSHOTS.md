# Spritz Screenshots Runbook

Captures full-page PNGs of every Spritz screen at mobile + desktop viewports, in both signed-out and signed-in states, against your local dev server.

Output: `screenshots/<auth-mode>/<viewport>/<route>.png`.

## What gets captured automatically

| Category | Routes |
| --- | --- |
| Marketing + auth (signed-out) | Marketing home, `/pricing`, `/sign-in`, `/sign-up`, signed-out `/scan` |
| Core encyclopedia (public) | `/families`, `/houses`, `/notes`, `/search` empty, `/search` with typeahead open, `/search?q=tobacco`, `/fragrance/[id]`, `/note/[slug]`, `/house/[slug]`, `/family/[slug]` |
| Signed-in surfaces | For You home, `/welcome` onboarding, `/collection` (own/tried/wishlist tabs), `/account`, signed-in `/scan` |

Dynamic IDs and slugs are resolved live: the script queries Supabase for the most popular fragrance (with a bottle image), the first catalog house, the first catalog family, and pulls a note slug from `editorial/notes/`. So every shot is against a real record.

## What needs manual capture

| State | Why automation is awkward | How to capture |
| --- | --- | --- |
| Camera live viewport | Headless Chromium has a fake green-card camera. The brackets render but the "video" is not representative. | Open `/scan` on your phone or in real Chrome, tap "Use camera", screenshot. |
| Captured frame | Requires you to actually tap capture after the live stream is up. | Same as above, tap capture, screenshot. |
| Processing overlay | Brief moment (~2s) between capture and result. | Throttle the network in DevTools, tap capture, screenshot mid-transition. |
| Scan result with match | Result lives in component state, not a URL. | Do a real scan, screenshot the result. |
| Scan miss + report flow | Same. | Scan something we won't match (any non-perfume bottle), screenshot, tap "We missed this", screenshot the form. |

## One-time setup

```bash
# 1. Install Playwright + Chromium binary
pnpm add -D playwright
npx playwright install chromium

# 2. Make sure your env is loaded for the script
#    (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
#    Easiest is to source .env.local before running:
set -a; source .env.local; set +a
```

## Every-run workflow

In one terminal, start the dev server:

```bash
pnpm dev
```

In a second terminal, source your env if you opened a fresh shell:

```bash
set -a; source .env.local; set +a
```

Then, once (or whenever your Clerk session expires), capture an authenticated state:

```bash
pnpm screenshots:auth
```

A browser window opens at `/sign-in`. Sign in with your Clerk dev user. Once you land on the home or welcome page, come back to the terminal and hit ENTER. The script saves `.auth/state.json`.

Now run the capture:

```bash
pnpm screenshots
```

PNGs land in `screenshots/`. Layout:

```
screenshots/
  signed-out/
    mobile/
      01-home-marketing.png
      02-pricing.png
      ...
    desktop/
      ...
  signed-in/
    mobile/
      30-home-for-you.png
      32-collection-own.png
      ...
    desktop/
      ...
```

Numeric prefixes are sort order: marketing first, then encyclopedia, then signed-in product. Easy to flip through.

## Configuration

Environment variables read by the script:

| Var | Default | What it does |
| --- | --- | --- |
| `SCREENSHOT_BASE_URL` | `http://localhost:3000` | Where to point the browser. Set this if you want to capture against a Vercel preview deploy instead of local. |
| `NEXT_PUBLIC_SUPABASE_URL` | (required) | For resolving dynamic routes against the live catalog. |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Same. Read-only here, just for picking representative IDs. |

Capture against a preview deploy:

```bash
SCREENSHOT_BASE_URL=https://spritz-git-feature-x.vercel.app pnpm screenshots
```

The signed-in pass will still need a fresh `.auth/state.json` captured against that same base URL (re-run `pnpm screenshots:auth` with the env var set).

## Troubleshooting

**"no .auth/state.json"** — Run `pnpm screenshots:auth` first. Or, if you only want signed-out shots, ignore the warning; the script will skip signed-in routes.

**Signed-in routes redirect to `/sign-in`** — Your Clerk session expired. Re-run `pnpm screenshots:auth` and try again. Clerk dev sessions are short.

**Detail pages 404** — The dynamic-route resolver couldn't find a row. Check that `fragrances`, `list_catalog_houses`, and `list_catalog_families` have data. Re-run the seed/scrape pipeline if your DB is empty.

**Some pages are blank** — The script waits for `networkidle` + `document.fonts.ready`, but slow Supabase queries can still beat the timeout. Bump the `timeout` in `capture.mjs` (default 30s) or increase `pnpm dev` warmup before running.

**Bot detection from Clerk** — If signed-in shots fail with a "verifying you are human" page, add `@clerk/testing` and follow Clerk's Playwright fixture pattern. The current storageState approach works for dev instances; production keys can be stricter.

## Re-running after a UI change

Just re-run `pnpm screenshots`. Existing PNGs are overwritten in place. The numeric prefix scheme keeps file paths stable so screenshot diffs in git (or in a visual diff tool) actually compare the right things.

## Want a single index page?

After capture, this one-liner builds a quick HTML gallery of every PNG:

```bash
(echo '<html><body style="font-family:system-ui;background:#222;color:#eee;padding:24px;">'; find screenshots -name '*.png' | sort | while read f; do echo "<div><h3>$f</h3><img src=\"$f\" style=\"max-width:400px;border:1px solid #444;margin-bottom:24px;\"></div>"; done; echo '</body></html>') > screenshots/index.html && open screenshots/index.html
```
