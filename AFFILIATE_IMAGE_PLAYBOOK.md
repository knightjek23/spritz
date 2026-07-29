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

### Fallback: Amazon Associates
- Amazon's Product Advertising API also gives licensed images with big
  fragrance coverage. Catch: they require ~3 qualifying sales within 180 days
  to keep API access, so it's a supplement, not your primary source early on.

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

## Part 1b: Target list (researched July 2026)

Rakuten is out (their $10M revenue floor). These are the networks and
retailers that are actually reachable for a solo pre-revenue publisher.

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
