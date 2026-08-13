# Affiliate + Image Playbook

The plan to replace scraped bottle images with licensed ones. Three parts:
apply to the affiliate networks, reach out directly in parallel, then run
the backfill script once you have a product feed.

---

## Part 1: Affiliate application walkthrough

FragranceNet and Nordstrom both run through **Rakuten Advertising**, so you
sign up once and apply to each merchant inside it. It's free. Budget a few
days to a couple of weeks for approvals.

### Step 1: Create a Rakuten Advertising publisher account
- Go to rakutenadvertising.com and sign up as a **Publisher / Affiliate**.
- You'll need a live site (you have one: spritzofficial.app), rough monthly
  traffic (fill this in honestly, do not inflate it), and a short business
  description. Use the copy in the box below.
- Network approval usually takes a couple of business days.

### Step 2: Apply to the merchant programs
- Inside the Rakuten dashboard, go to **Advertisers**, search **FragranceNet**,
  and apply. Paste the "How you'll promote" copy below into the application.
- Do the same for **Nordstrom**. Note: Nordstrom is **US affiliates only**, so
  a US entity/address helps.
- Each merchant reviews you separately against their own relevance and brand
  guidelines. Approval is not automatic and can take days to a couple weeks.

### Step 3: Request product feed / catalog access
- This is the step that unlocks the images. In the Rakuten Publisher Help
  Center, request **Product Catalog** access: it needs an SFTP account set up
  by their support, plus per-advertiser catalog approval.
- The feed is a CSV or TSV with, per product, the name, brand, an image URL
  you're licensed to display, and a product URL.

### Step 4: Backfill the images
- Download the feed, drop it in `scraper/data/`, and run the backfill script
  (Part 3). Done.

### Fallback: Amazon Associates — RULED OUT (August 2026)
- Do not build on this. The Associates IP Licence states: "You will **not
  store or cache Product Advertising Content consisting of an image**, but you
  may store a link to Product Advertising Content consisting of an image **for
  up to 24 hours**." Only ASINs may be retained. Every use must link to Amazon.
  A persistent catalog is not compatible with those terms.
- Separately, PA-API v5 is deprecated (returns 403) in favour of the Creators
  API, and access still requires qualifying sales first.

---

### Application copy (paste into the forms)

**Describe your site / business:**

> Spritz (spritzofficial.app) is a mobile fragrance library. People scan a
> bottle or search for one and get the full breakdown: the notes, the
> perfumer who made it, how long it lasts, when to wear it, and the story of
> the house behind it. I built it for people who want to actually understand
> a fragrance before they spend money on it, so most of our users show up
> already deciding what to buy. Every fragrance page links out to a trusted
> retailer to purchase the real bottle. The catalog covers thousands of
> designer and niche fragrances.

**How you'll promote our products:**

> Spritz sends you buyers, not browsers. Someone reads up on a fragrance,
> decides it's worth it, and taps through to your store to get the real
> thing. That's a person who has already done their research and knows
> exactly what they want, which is about the highest-intent traffic there
> is. I keep the app clean and honest, so no pop-up spam and no fake
> discounts, just good information that helps people buy with confidence. As
> the catalog grows, so does the number of fragrances I can point your way.

---

## Part 1b: Target list (researched July 2026, CORRECTED August 2026)

> **Corrections from the August 2026 deep dive** (full findings in
> `IMAGE_SOURCING_RESEARCH.md`):
>
> 1. **Rakuten is NOT out.** The "$10M revenue floor" was wrong. Rakuten's own
>    publisher requirements ask only for a live site with original content — no
>    revenue or traffic minimum, free to join. The friction is at the
>    *advertiser* level, which is probably where the rumour came from. Rakuten
>    runs **Sephora, Ulta and FragranceNet**. Put it back on the list at #2.
> 2. **Amazon Associates is dead for this purpose.** Their IP Licence forbids
>    storing or caching images and caps stored image URLs at 24 hours. PA-API v5
>    is also deprecated. Remove it as a fallback.
> 3. **The Fragrance Shop's Awin program is closed.** Drop it.
> 4. **Every network grant is promotion-scoped and revocable** — see the
>    "license shape" note at the end of this section before building on feeds.

These are the networks and retailers that are actually reachable for a solo
pre-revenue publisher.

### Networks, ranked by how easily you get in

| Network | Cost | Why it matters |
| --- | --- | --- |
| **FlexOffers** | Free | Hosts **both FragranceX and Perfume.com**. Approval in a few days. Best single target. |
| **Awin (ShareASale merged in)** | Small refundable verification fee ($1 to $5) | ~9,500 advertisers. Approval up to 48 hrs, then per-advertiser. |
| **Sovrn Commerce (was VigLink)** | Free | Carries FragranceX and Perfume.com. Low barrier. |
| **Impact.com** | Free | Where Scentbird runs. Also Perfume.com. |
| **CJ (Commission Junction)** | Free | FragranceX's other home. Stricter on new publishers. |

### Retailers worth applying to

| Retailer | Network(s) | Commission | Notes |
| --- | --- | --- | --- |
| **FragranceX** | FlexOffers, CJ, Sovrn | 8 to 12% | Explicitly maintains a **product feed** for partners. Top priority for images. |
| **Perfume.com** | FlexOffers, Skimlinks, Sovrn, Impact | 1% | Low commission, but you're here for the images. |
| **Scentbird** | Impact | up to 14% | You already have a `SCENTBIRD_AFFILIATE_ID` slot in your env. Check if that's a live relationship. |
| **Notino** | Various | 4 to 10% | 30,000+ brands, good catalog coverage. |
| **FragranceNet** | Rakuten | n/a | Blocked by the Rakuten floor. Skip for now. |

### Awin deep dive: which advertisers actually solve the image problem

Awin turned out to be the strongest option, for one reason that has nothing
to do with commission rates.

**Create-a-Feed is the unlock.** Awin has a publisher tool (Interface →
Toolbox → Create-a-Feed) that builds a custom product feed filtered by
category, advertiser, and brand, across *every advertiser you're approved
for at once*. The feed includes a **`merchant_image_url`** field. So instead
of juggling one feed per retailer, you generate a single fragrance-category
feed and run it through `pnpm backfill:images`. The script already knows
Awin's field names.

Ranked by catalog coverage, which is what matters for filling 7,000 rows:

> **SUPERSEDED August 2026.** This table has errors — see `AWIN_TARGETS.md`
> for the verified list with live Awin merchant IDs. Key corrections:
> **Notino is NOT on Awin** (it's CJ — Notino's own affiliate page says so),
> **The Fragrance Shop's Awin programme is closed**, and "Perfume Price"
> (ID 21605) is now **Paco Perfumerias**. The two biggest Awin fragrance
> catalogs are actually **Douglas_DE (140,000+ articles)** and **Flaconi DE
> (50,000+ products)**, neither of which appears below.

| Advertiser | Catalog | Brands | Why it matters |
| --- | --- | --- | --- |
| ~~**Notino**~~ | ~22,000 products | 1,500 | ❌ **NOT ON AWIN — it's CJ.** Catalog figures plausible, network attribution wrong. |
| **Fragrance Direct** | ~14,000 products | 600 | ✅ Confirmed, **Awin ID 9**. Hugo Boss, Paco Rabanne, Armani, YSL. 2 to 5%. PPC on brand terms prohibited. |
| ~~**The Fragrance Shop**~~ | ~2,000 fragrances | 130 | ❌ **Programme closed** (Awin 8097). |
| **The Fragrance Counter** | 150+ brands | n/a | ✅ **Awin ID 20978.** Direct brand relationships, at least daily feed. Niche depth. |
| **Perfume Shopping / Perfume Price** | n/a | n/a | ⚠️ Perfume Shopping = **ID 5901**, no feed on profile. "Perfume Price" = **ID 21605**, now **Paco Perfumerias**. |
| **Superdrug** | broad beauty | n/a | ⚠️ Network unconfirmed — their affiliate page names none. Low priority regardless. |

Notino plus Fragrance Direct alone is roughly 36,000 products across 2,100
brands, which should cover the overwhelming majority of your designer
catalog. Niche houses will be thinner, and those are the rows most likely to
keep the initials placeholder.

**Note these are mostly UK retailers.** That doesn't hurt you. Designer
fragrances are the same products worldwide, so a UK feed's Dior Sauvage
image is the same bottle as a US one. It only matters if you later want the
affiliate *links* to point at US storefronts for US buyers, which is a
revenue question, not an image question.

### Order of operations

1. **FlexOffers first.** Free, and one approval puts FragranceX and
   Perfume.com within reach. Apply, then apply to those two advertisers.
2. **Awin second** (small fee, big catalog).
3. **Impact third**, mainly for Scentbird.
4. Once any advertiser approves you, pull their product feed and run
   `pnpm backfill:images`.

**Honest note on contacts:** these companies don't publish named affiliate
managers. Everything runs through the network application forms, which is
the intended path and works fine. The emails below are for the cases where
a form isn't enough: a retailer with no network presence, a follow-up after
a rejection, or a brand you want official press images from. Send them
through the company's partnerships or press contact form, or to a
`partnerships@` / `affiliates@` / `press@` address if their site lists one.
Do not guess at an individual's email address.

---

## Part 2: Direct outreach emails

Run these in parallel with the applications. They can move faster than the
approval queue, and they open doors the affiliate networks don't (official
brand press images, smaller retailers). Swap the bracketed bits per contact.

### Email A: retailer partnerships / affiliate team

Send via the retailer's partnerships contact form, or to `affiliates@` /
`partnerships@` if their site lists one. Drop the greeting to "Hey there," if
you don't have a name.

**Subject:** Sending you fragrance buyers from Spritz

> Hey [Name],
>
> I'm Josh, the founder of Spritz (spritzofficial.app). It's a fragrance app
> where people look up a bottle, read the full breakdown of it, and decide if
> it's worth buying. Most folks land on a fragrance because they're already
> close to pulling the trigger.
>
> I'd love to send those buyers your way. When someone finishes reading about
> a fragrance you carry, I can point them straight to your store to get it. To
> do that cleanly, I'd need the okay to show your product images on the
> fragrance pages, ideally through your affiliate feed so it stays licensed
> and current.
>
> If you run an affiliate program, I'm happy to sign up and go through the
> normal process. If there's a faster way to get set up, even better. Either
> way, I just want to send you people who are ready to spend.
>
> Who's the right person to talk to about this?
>
> Thanks,
> Josh
> spritzofficial.app

### Email A2: after a network rejection, or to ask about the feed directly

Use this when you've applied through a network and been declined or left
waiting, and want to make the case directly.

**Subject:** Spritz + [Retailer], quick question about your affiliate feed

> Hey there,
>
> I applied to your affiliate program through [network] as Spritz
> (spritzofficial.app). We're a fragrance app: people look up a bottle, get
> the full breakdown of it, and decide whether to buy. The traffic is small
> right now but it's about as high-intent as it gets, since nobody opens the
> app unless they're already curious about a specific fragrance.
>
> Two things I'd love your help with. First, whether there's anything I can
> do to move the application along. Second, whether I can use your product
> feed images on the fragrance pages, since showing the actual bottle is what
> makes someone confident enough to click through and buy.
>
> Happy to send over more detail on the app if that helps. Thanks for the
> time.
>
> Josh
> spritzofficial.app

### Email B: fragrance brand PR / press team (for official images)

**Subject:** Featuring [Brand] on Spritz, quick question on images

> Hey [Name],
>
> I'm Josh, the founder of Spritz (spritzofficial.app), a fragrance app that
> breaks down what's actually in a bottle: the notes, the perfumer, how it
> wears, the story behind the house. [Brand] comes up a lot, because people
> love your fragrances and want to understand them.
>
> I'd like to feature your fragrances with proper, official product images
> rather than whatever's floating around the web. Do you have a press kit or
> media assets I could use, or someone who handles image permissions? I'm glad
> to credit [Brand] and send people to your site or an authorized retailer to
> buy.
>
> Happy to share more about the app if it helps. Thanks for making things
> people genuinely love.
>
> Josh
> spritzofficial.app

### Follow-up (send about 4 days later if no reply)

> Hey [Name], just floating this back up in case it slipped by. No pressure at
> all if now isn't the time. I'd still love to feature [Brand / your products]
> the right way whenever it works for you. Thanks!

---

## Part 3: Backfill script

Once a merchant approves you and you have a product feed:

```bash
cd scraper
# dry run first: see what would match, no DB writes
pnpm backfill:images --feed=./data/your-feed.csv --dry
# then the real run
pnpm backfill:images --feed=./data/your-feed.csv
```

What it does: matches each catalog fragrance to a feed product by normalized
brand and name, and writes the feed's licensed image URL into
`bottle_image_url`. It only fills rows whose image is currently empty or an
unlicensed source, so it never overwrites a good image. Unmatched fragrances
keep the house-initials placeholder.

Before your first run, open your feed's header row and set `FEED_COLUMNS` at
the top of `scraper/src/backfill-affiliate-images.ts` to match your column
names. Every advertiser's export is a little different.

---

## Part 4: Mirroring, and what it is and isn't for

`pnpm mirror:images` copies every fimgs.net bottle image into our own
Supabase Storage bucket and repoints the DB row at it.

**Be clear about which problem this solves.** It solves *reliability*: right
now Fragrantica serves the bytes for the entire catalog, and a referrer block
on their side blanks every card in the app with no warning and no recourse.
Mirroring means we own the host, so that can't happen.

It does **not** reduce legal exposure, it increases it. Hotlinking is them
serving their bytes; mirroring is us distributing ~7,000 copies from our own
bucket. That's why `lib/bottle-image.ts` lists the `bottle-images` bucket in
`BLOCKED_SOURCE_PATTERNS` right next to fimgs.net. Mirroring is insurance for
the pre-launch and affiliate-review window, not the launch answer. The launch
answer is Parts 1 to 3 above.

The two compose cleanly: `backfill-affiliate-images.ts` treats a bucket URL as
unlicensed, so licensed feed images still overwrite mirrored rows later.
Mirroring now costs you nothing later.

### Runbook

1. **Diagnose first.** Run `scripts/audit-mirror-readiness.sql` in the
   Supabase SQL editor. Query 1 tells you how many rows are candidates;
   query 3 flags any shared URL that's really a placeholder graphic and
   should be added to `PLACEHOLDER_PATTERNS` before you start; query 5 sizes
   the bucket.
2. **Create the bucket** (one-time): Supabase dashboard, Storage, New bucket,
   name `bottle-images`, set Public, confirm the public-read policy.
3. **Dry run**, no downloads or writes:
   ```bash
   cd scraper
   pnpm mirror:images --dry --limit=50
   ```
4. **Smoke test** 20 real images, then eyeball them in the Storage browser
   and on a couple of fragrance pages:
   ```bash
   pnpm mirror:images --limit=20
   ```
5. **Full run.** Roughly 30 to 45 minutes for ~7,000 images at the default
   pacing and `IMAGE_CONCURRENCY=3`. Safe to Ctrl-C and resume: only rows
   still pointing at fimgs.net are candidates, so a re-run picks up exactly
   what's left plus anything that failed.
   ```bash
   pnpm mirror:images
   ```
6. **Verify.** Re-run query 1 of the audit: `fimgs` should be near zero and
   `supabase mirror` should hold the balance. Expect some failures; the
   fimgs URLs were reconstructed from perfume ids by
   `rewire-fragrantica-images.sql`, so a slice of them 404. Those rows keep
   the house-initials placeholder, which is the correct outcome.

### Before public launch

Flip `BLOCK_UNLICENSED_SOURCES` to `true` in `lib/bottle-image.ts` and run
`scripts/blank-unlicensed-images.sql`. That blocks fimgs URLs *and* the
mirror bucket, falling everything back to house initials except the licensed
images the affiliate backfill has landed.
