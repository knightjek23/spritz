# FlexOffers application prep

Everything you need to paste, in the order the form asks for it. Sign up at
**flexoffers.com/sign-up**. Free, no fee. Approval usually takes a few days.

---

## Step 1: Account info

Your own name, email, password. Nothing to prep.

You'll get a confirmation email. Click the link before continuing.

## Step 2: Company info

- **Company name:** Spritz (or your registered business name if you have one)
- **Address / country:** yours
- **Company title:** Founder
- **Phone:** yours (they text a verification code later, so use a number you
  have on hand)

## Step 3: Traffic sources

Select **"My website"**. That's your primary and the one that gets verified.

If you also plan to promote on social, add those accounts as separate traffic
sources now rather than later. Every source has to be approved individually,
and links can only run on approved sources.

## Step 4: Website details

**Website name:** Spritz

**Website URL:** https://spritzofficial.app

**Describe the content of your website:**

> Spritz is a mobile fragrance library. Scan a bottle or search one and get
> the full breakdown: notes, perfumer, longevity, how to wear it. Users
> arrive already deciding what to buy, and every page links out to a retailer
> to purchase. The catalog covers thousands of designer and niche fragrances.

**Where you want to place the links:**

> On individual fragrance pages, alongside the fragrance the user is reading
> about. Each page has a single clear link out to a retailer to buy that
> specific bottle.

**How you bring visitors to your website:**

> Organic search (each fragrance has its own indexed page), direct traffic
> from people using the app to look up bottles, and social. No paid search,
> no incentivized clicks, no email blasts.

## Step 5: Verification

Two parts:

1. **Phone:** they text you a code.
2. **Website:** they'll give you a meta tag to add to your site's `<head>`,
   then check for it. Send me the tag and I'll wire it into the app's layout
   in about a minute, then you redeploy and hit verify.

---

## After approval

1. In the FlexOffers dashboard, search the advertiser directory for
   **FragranceX** and apply. This is the priority: 8 to 12% commission, and
   they maintain a **product feed** for partners, which is the licensed image
   source we need.
2. Also apply to **Perfume.com** (same network, 1% commission, but again,
   we're here for the images).
3. Once an advertiser approves you, download their product feed, drop it in
   `scraper/data/`, and run:

```bash
cd scraper
pnpm backfill:images --feed=./data/fragrancex-feed.csv --dry   # preview
pnpm backfill:images --feed=./data/fragrancex-feed.csv         # for real
```

Then flip `BLOCK_UNLICENSED_SOURCES` to `true` in `lib/bottle-image.ts` and
clear the old scraped URLs with `scripts/blank-unlicensed-images.sql`. At
that point every image in the app is licensed and the legal exposure is gone.

---

## Notes

- Network approval and advertiser approval are separate. Getting into
  FlexOffers doesn't mean FragranceX auto-approves you. If an advertiser
  declines or goes quiet, use Email A2 in `AFFILIATE_IMAGE_PLAYBOOK.md`.
- Be straight about your traffic numbers. They evaluate every traffic source,
  and a small honest number is fine. An inflated one that doesn't match their
  own measurement is what gets accounts killed.
