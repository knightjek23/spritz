# Spritz case study screenshots

Eleven JPGs, cut from the full-page PNGs your Playwright script captured against production on August 12, 2026.

Mobile shots are 780x1688, which is the iPhone 14 Pro viewport at 2x. They're cropped to exactly one screen height so the floating bottom nav sits where it actually sits on a phone. Full-page captures stretch the viewport, which strands any `position: fixed` element in the middle of the image, so an uncropped full-page shot has the nav pill floating across the content. That's why these are viewport crops rather than the raw PNGs.

Scroll-section shots are cropped from below that stranded-nav band, so they're clean.

## Where each one goes

| File | Screen | Case study section |
|---|---|---|
| `spritz-01-home-mobile.jpg` | Marketing home, "Every fragrance, broken down" | Hero, and Design (this is the rewritten hero from the user test) |
| `spritz-02-fragrance-detail-mobile.jpg` | Creed Aventus detail, top of page | Hero or Architecture. The core product surface |
| `spritz-03-scan-mobile.jpg` | `/scan` camera permission state | Architecture, next to the scan flow diagram |
| `spritz-04-pricing-mobile.jpg` | Pricing with the Monthly / Annual / Lifetime toggle | What I'd do differently, next to the trial reversal |
| `spritz-05-library-families-mobile.jpg` | Library, the 18 families with counts | The problem, or Where it landed |
| `spritz-06-search-typeahead-mobile.jpg` | Search with live typeahead on "tobacco" | Optional. Good for showing the trigram matching |
| `spritz-07-notes-pyramid-mobile.jpg` | Notes pyramid, top / heart / base | Design. This is the screen the whole product is built around |
| `spritz-08-known-dupes-mobile.jpg` | Known dupes with confidence badges | What I'd do differently, next to the n=1 positioning tension |
| `spritz-09-home-trending-mobile.jpg` | Most searched, Trending, New this year | Design, next to the user-test rewrite |
| `spritz-10-home-desktop.jpg` | Home at 1280x900 | Optional |
| `spritz-11-fragrance-detail-desktop.jpg` | Aventus detail at 1280x900 | Optional |

The two desktop shots are the weakest of the set. Most pages are `max-w-md`, so desktop renders as a narrow column in a wide frame, which is honest but not flattering. The case study already says mobile is the primary surface, so leading with mobile is consistent.

## Missing: the signed-in screens

The `signed-in/` folder in `screenshots/` is not actually signed in. Every file in it is byte-identical to its signed-out counterpart, and `32-collection-own.png` is a Clerk sign-in page. The saved `.auth/state.json` was captured against `localhost`, so its cookies are scoped to that origin and Clerk on production ignored them.

To get Collection, For You home, Account, and the signed-in scan:

```
node --env-file=.env.local scripts/screenshots/prod-auth.mjs
node --env-file=.env.local scripts/screenshots/prod.mjs
```

Sign in when the browser window opens, press ENTER, then let the capture run again.

## Two things worth fixing in the product

Neither affects the case study, but both showed up in these captures.

**The Clerk sign-in card is unskinned.** It renders in default Clerk purple with the stock button, not the emerald and cream system. There's a commit in the history called "Skin Clerk auth to match Spritz design system," so either the appearance config isn't reaching the production instance or it regressed. It's the first thing a new user sees after tapping Sign in.

**There's an em dash in the pricing copy.** `spritz-04-pricing-mobile.jpg` reads "Billed annually — that's ~$2.50/mo." The sweep missed that one.
