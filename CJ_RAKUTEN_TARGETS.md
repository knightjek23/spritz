# CJ and Rakuten — Advertiser Targets

Researched August 2026. Companion to `AWIN_TARGETS.md`. Same process.

**Headline: neither network should be the backbone. Awin stays primary.** Both
have specific, verifiable problems that Awin doesn't — CJ's terms are actively
hostile to a pre-revenue catalog build, and Rakuten's feed infrastructure is
sitting under an unresolved platform migration.

---

# ⚠️ Two corrections to earlier notes

### 1. Rakuten is migrating to impact.com

Announced **28 April 2026**: Rakuten Advertising **stopped operating its own
affiliate tracking technology**. impact.com becomes the underlying platform and
**~2,000 Rakuten advertiser programs are migrating**, in waves across 2026-2027.
Rakuten keeps managed services, strategy, analytics and Rakuten Rewards.

**Their announcement says nothing about the fate of publisher Product Catalog
SFTP feeds or the Product Search API** — which is exactly the infrastructure this
project would depend on. Not confirmed bad; confirmed *unstated*. Building a
7,000-product pipeline on the legacy LinkShare feed format right now means
building on a stack whose owner has publicly stopped investing in it.

### 2. The Rakuten "600x600 minimum, 10 images" spec is the wrong document

That spec is real but it's the **advertiser-facing** upload spec — what merchants
push *into* Rakuten. What publishers actually download is a different, older
LinkShare format:

- **Exactly one image field.** No `additional_image_link`. No multi-angle shots.
- **No image dimension guarantee at all.** The 600x600 minimum does not apply.
- **Brand (17), MPN (20) and UPC (24) are all optional fields.**

That last point is the killer for matching. You cannot rely on GTIN/UPC being
populated, so you're back to fuzzy Product Name + Brand matching with all the
"EDP vs Eau de Parfum vs 100ml vs 3.4oz" pain.

Also: **Ulta has moved to Impact**, not Rakuten. Sephora and FragranceNet are
still Rakuten.

---

# CJ Affiliate

## The dormancy problem — verified verbatim, and it's disqualifying as a foundation

Both clauses confirmed in three independent archived copies of the CJ Publisher
Service Agreement (SEC EDGAR 2007, Justia, Law Insider "Posted April 13, 2012").

**§3(f) Dormant Accounts:**

> "If Publisher's Account has not been credited with a valid, compensable
> Transaction … during any rolling, six consecutive calendar month period
> ('Dormant Account'), a dormant account fee at CJ's then-current rate shall be
> applied … **or until Your Account balance reaches a zero balance, at which time
> the Account shall become deactivated**."

**§6(c) Termination or Deactivation by CJ:**

> "CJ may temporarily deactivate or terminate Your Account if … **(ii) Your
> Account has not been logged into and/or there have been no Transactions
> credited to Your Account for any 30 day period**"

Fee is **$10/month**, first-hand reported and still cited in 2026.

**The trap, and it's the opposite of how people read it.** Everyone assumes the
dormant fee just nibbles your balance, so a zero-balance publisher is safe
because there's nothing to take. Backwards. The clause says the fee applies each
month *or until the balance reaches zero, at which time the Account shall become
deactivated*. **A pre-revenue publisher's balance is already zero — you're in the
terminal state on day one of dormancy.** There's no runway to burn.

Secondary reporting for 2026 claims CJ auto-deactivates new publisher accounts
that fail to earn a commission within **90 days** — tighter than §3(f)'s six
months. Unverified against primary text, but plan for 90, not 180.

**And deactivation revokes the image license.** §4(a) grants display rights only
"For each Advertiser's Program **that You have been accepted to**." Deactivation
ends acceptance, which ends the grant. Every image sourced from CJ becomes
unlicensed the moment the account dies. **Your image library would have a fuse on
it, set by a revenue threshold you can't hit yet.**

## CJ's image clause is stricter than Awin's

**§4(a):**

> "Your use of the Link signifies Your agreement to refrain from **copying** or
> modifying any icons, buttons, banners, graphics files or content contained in
> the Link"

"Refrain from **copying**" is broader than Awin's "without modification." Read
strictly it forbids rehosting *and* the normalization pipeline — cropping to a
consistent aspect ratio, background removal, thumbnail variants, WebP
transcoding. There is no clause anywhere in the agreement that *permits*
caching, so hotlinking is the defensible read, which means inheriting each
advertiser's uptime, URL churn and hotlink protection.

Note also **who** grants: "the **Advertiser** is granting to You" — CJ is a
conduit. Each advertiser's own program terms layer on top and are not uniform.

## The one genuinely useful CJ capability: pre-approval reconnaissance

CJ is **GraphQL-first**. Endpoints:

| Purpose | Endpoint |
| --- | --- |
| Products / shopping feeds | `https://ads.api.cj.com/query` |
| Commissions | `https://commissions.api.cj.com/query` |
| Account / properties | `https://accounts.api.cj.com/graphql` |

Auth is a Bearer **Personal Access Token** from `developers.cj.com` →
Authentication → Personal Access Tokens (shown once, copy immediately). You also
need your CID from the dashboard.

**`products` / `shoppingProducts` require you to be joined to the advertiser** —
no images pre-approval. But **`shoppingProductFeeds` enumerates available feeds
*without* joining**, returning advertiser name, feed name, language, currency and
**product count**.

That's not Awin soft membership, but it is real reconnaissance: with a bare
account and zero relationships you can get a factual, current answer to "which
fragrance advertisers on CJ actually publish a feed, and how big is it?"
**Do this before applying to anything.** `ads.api.cj.com` also serves a GraphiQL
IDE — introspect `shoppingProducts` there to lock down the real image and
identifier field names in five minutes.

Rate limits (single source, verify): GraphQL 200 calls / 5 min, 1,000 records
per request max. A 100,000-product Notino feed is ~100 requests. **The API is not
the bottleneck; approval is.**

Feed UI path: `Account → Subscriptions → Create Product Export`. CJ migrated
network-wide to **Google Shopping format, 43 fields**. Delivery via CJFTP
(recommended), SFTP, HTTP or email. Cadence: *when updates occur* / daily / once.

## CJ target list

**Tier 1 — pure-play fragrance**

| # | Advertiser | ID | Market | Catalog | Commission / cookie | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Notino** | **CID 4612495** | 27 EU countries, **no US** | **1,500+ brands, 100,000+ products** | 10-12% tiered | Best breadth on any network. Feeds listed as promo material. CSS on Google/Bing Shopping needs written approval |
| 2 | **FragranceX** | not public | **US** | ~9,500 brands claimed | 1-10% / 45d | Strongest US pure-play. ⚠️ Sources conflict CJ vs Rakuten — verify at application |
| 3 | **Parfimo** | not public | EU (Brasty Group) | **1,000,000+ products claimed** | 2-8% / 15d | Largest claimed catalog |
| 4 | **Perfumania** | **merchant ID 904674** | US | Designer, deep discount | 4% / 15d | ✅ Confirmed on their own site. Explicit trademark bidding ban |
| 5 | **The PerfumeSpot** | not findable | US | Unknown | 10% / 14d | Small US pure-play |
| 6 | **Brasty** | not findable | EU | Unknown | 5% / 30d | Sister to Parfimo |

**Tier 2 — brand.com programs.** Elizabeth Arden (8%/30d), Moschino (8%/30d),
Giorgio Armani Beauty (2%/30d, conflicts with Awin). Each gives 20-60 SKUs
against your 7,000 — rounding error, and each costs a separate application plus
separate dormancy exposure. **Low priority.**

**Tier 3 — department stores.** Dillard's (3%). Nordstrom and Neiman Marcus have
contradictory network attributions across reputable directories. Giant mixed
feeds where fragrance is a thin slice, short cookies, selective approval a
pre-revenue site will likely fail. Skip.

**Confirmed NOT on CJ:** Sephora, Macy's, Kohl's, Ulta, Saks, Hudson's Bay,
T.J. Maxx → **Rakuten**. Scentbird → Impact. Dossier → ShareASale. Jo Malone →
FlexOffers. Lancôme, Arquiste, Superdrug, Feelunique, Lacoste → **Awin**.

## CJ application notes

No traffic minimum to join the network. Needs a **250-4,000 character business
description** (CJ: "Think of your description as an enthralling pitch for a great
movie!" — use the full length), promotional property type and model, W-9, and
bank details. CJ runs "identity verification, business legitimacy checks, and
historical performance analysis," delists 1,300+ publishers a year, and states
approval is not one-and-done.

Don't spray applications — CJ warns advertisers get hundreds weekly and applying
to programs you won't promote hurts you. **Apply to Notino, FragranceX, Parfimo
and Perfumania only.** Upload traffic/demographics in the Documents section.
Diarize a monthly login from day one — it's the only part of the dormancy
exposure you control.

---

# Rakuten Advertising

## The $10M revenue floor was definitively false

From [Requirements for Becoming a Publisher](https://pubhelp.rakutenadvertising.com/hc/en-us/articles/13214492487309-Requirements-for-Becoming-a-Publisher):

> "Anyone with a website, blog, or internet presence can join Rakuten
> Advertising."

Requirements: live site on a custom domain, original content, FTC disclosure
compliance, tax info, valid mailing address. No revenue floor, no traffic floor,
no numeric threshold of any kind. Network approval reported at **2-5 business
days**.

**Where the rumour came from:** affiliate agencies slot CJ and Rakuten as "best
for brands with $20M+ affiliate revenue targets" and advise considering them "if
your affiliate program is already generating eight figures." That's about
**advertisers**, not publishers, and it's descriptive rather than policy. The
only hard dollar figure in Rakuten's publisher system is a **$50 minimum payout**.

## No image license at network level — the license is per-advertiser

Read the Publisher Membership Agreement, the global Partner Membership Agreement
PDF, and the Affiliate Network Policies. The only license grant is §4.1, covering
**Supplier Tools** — and "Supplier Tools" is defined to *exclude* advertiser
assets ("**but excluding Qualifying Links provided by Advertisers**").

The agreement has **no defined term for "Creative"** and **no provisions
governing product catalog use or data feeds at all**. Network Policies are silent
on images, caching, rehosting and modification.

It pushes down explicitly: "Any Engagement that You enter into with an Advertiser
is subject to the terms and conditions set forth by that Advertiser."

A real example — Samsung UK's Rakuten program terms §4.2:

> "We grant to You a **revocable**, non-exclusive, worldwide license to use,
> reproduce and transmit the name, logos, trademarks, service marks, trade dress
> and proprietary technology … **solely for the purpose of referring a user from
> Your site(s) to Our site(s)**"

Plus: no modification, **no derivative works**, no sublicensing.

Three things follow. **Product photographs aren't explicitly enumerated** in that
list — arguably covered by trade dress or implication, but not clean, and it will
vary by advertiser. **"No derivative works" likely prohibits resizing, cropping,
background removal and thumbnail generation.** And **compliance is per-advertiser
and doesn't scale** — 12 advertisers means 12 license scopes, 12 revocation
risks, and no central place to check them. That's structural, not fixable.

## Rakuten target list

MIDs are **not public** — the advertiser directory is login-gated and the FMTC
directory paywalls it. Read them off the dashboard post-approval.

| # | Advertiser | Market | Catalog | Notes |
| --- | --- | --- | --- | --- |
| 1 | **FragranceNet.com** | US | Pure-play, very large | ✅ Primary-source confirmed. **Best single Rakuten target.** partners@fragrancenet.com |
| 2 | **The Perfume Shop** | UK | **130 brands**, 215+ stores | ✅ Primary-source confirmed. UK's largest fragrance specialist |
| 3 | **Sephora** | US | Large, incl. exclusive niche | ✅ Confirmed. **Strict.** Direct human contact: **ra-join-sephora@mail.rakuten.com** |
| 4 | **Bloomingdale's** | US | Strong prestige fragrance | ✅ Primary-source confirmed |
| 5 | **Macy's** | US | Very broad | Up to 6% / 1-day cookie. Reported "easy approval" — cookie length is irrelevant when you want pixels |
| 6 | **Saks Fifth Avenue** | US | Luxury, strong niche | ~2.4% / 14d |
| 7 | **Estée Lauder** | US/UK | Brand-owned portfolio | ~4% |
| 8 | **Elizabeth Arden** | US | Brand-owned | 8% / 30d |
| 9 | **Hudson's Bay** | CA | Dept store | 4% / 7d |
| 10 | **Kohl's / T.J. Maxx** | US | Thin, volatile fragrance | Low value for a stable encyclopedia |

**NOT on Rakuten:** Ulta → **Impact** (moved). Space NK → **Awin** (merchant
59805, 5,000+ products — good Awin add). Neiman Marcus, Perfumania, L'Occitane,
Notino → CJ. Jo Malone → FlexOffers. Scentbird, Victoria's Secret → Impact.
Charlotte Tilbury → direct (partnerships@charlottetilbury.com). Lord & Taylor —
brand collapsed, dead.

## Rakuten mechanics

UI path: **Links → Product Feeds**. Delivery is SFTP to
**`aftp.linksynergy.com`** (binary transfer mode mandatory — ASCII corrupts the
files), max 5 concurrent connections, `.txt.gz` pipe-delimited or `.xml.gz`.
Files generate dynamically on retrieval; **no push notification**, so poll on
timestamp and apply deltas.

**Product Search API** is honestly the better fit than SFTP — targeted keyword
lookup per fragrance rather than parsing full catalogs:

- Host `https://api.linksynergy.com`, OAuth2 bearer, needs SID + Client ID +
  Client Secret
- **XML only**, no JSON
- **100 calls/min, max 5,000 results per call** — comfortably enough for 7,000
- Only returns products from advertisers you're approved for

**Two approval layers, both required:** request SFTP setup via Customer Support,
*then* per-advertiser Product Catalog approval on top of program approval. **No
pre-approval preview of any kind** — strictly worse than Awin.

**"Auto enrollment"** (Feed Settings) is *not* auto-join. It bundles the catalog
request with the program application so you don't apply twice. Removes a step,
not a gate. Turn it on anyway.

## Rakuten approval reality

Network entry is easy. Advertiser approval is the bottleneck, and Rakuten
publishes the framework: applications are **automatically declined** (no
reapplication), **temporarily declined** (reapply after 15 days), or
**permanently declined**. Four criteria — Web Presence, Country of Residence,
**Traffic Requirements**, General Content.

"Adequate incoming traffic and **affiliate marketing transaction activity**" is
undefined and advertiser-set. Chicken-and-egg for a pre-revenue publisher.
Publisher reports corroborate: "rejection reasons are rarely communicated,"
"Rakuten rewards publishers with established traffic," "brands on Rakuten tend to
be pickier."

Realistic expectation: network approval inside a week; likely approval from
Macy's, Kohl's, T.J. Maxx; genuine uncertainty on FragranceNet, The Perfume Shop,
Bloomingdale's, Saks; likely rejection or silence from Sephora first time.

**Application tips:** describe the promotional space as an editorial reference
product, never coupon/loyalty/cashback (Nordstrom explicitly excludes those).
Pick a content/editorial category. Don't inflate traffic — web presence is
verified and inconsistency invites permanent decline. **Lead with catalog depth,
not traffic** — ~7,000 catalogued fragrances is the thing that makes a
low-traffic app interesting to a beauty advertiser. Use the direct channels
(ra-join-sephora@mail.rakuten.com, partners@fragrancenet.com); Rakuten itself
tells rejected publishers to contact advertisers directly with their SID.
Respect the 15-day reapplication rule.

---

# The Arab / oud gap

**No Western affiliate network solves this segment.** Ajmal, Rasasi, Swiss
Arabian, Lattafa, Golden Scent, Ounass, Faces — none found on CJ or Rakuten, and
the regional network **ArabClicks** is where Ajmal et al. actually live.

The only hit anywhere in this research is **Opulensi on Awin (ID 123248)** —
Lattafa, Maison Alhambra, Sapil, Anfar, Adyan, Al Rehan. That's another reason
Awin stays primary. For the rest of the segment, plan direct licensing or brand
press kits.

---

# Recommended sequencing

1. **Awin** — primary. Soft membership, day-one feed access, Opulensi for the
   Arab tail. Unchanged.
2. **CJ, for reconnaissance first.** Free, no traffic minimum. Sign up, generate
   a PAT, run `shoppingProductFeeds` and introspect `shoppingProducts` in
   GraphiQL. That costs nothing and resolves the unverified cells above. Then
   apply only to Notino, FragranceX, Parfimo, Perfumania. **Treat CJ as
   supplementary, never the foundation** — §4(a)'s copy ban and the
   deactivation-revokes-license problem make it structurally wrong for a durable
   catalog.
3. **Rakuten** — apply now (free, fast, no risk), target FragranceNet and The
   Perfume Shop, turn on Auto enrollment. But hold engineering effort until the
   impact.com migration clarifies what happens to the Product Catalog feeds.

**Open items:** fate of Rakuten's feeds post-migration; exact CJ feed field names
(resolvable in GraphiQL); whether CJ's live PSA still carries §3(f)/§6(c)
unchanged (most recent reachable copy is versioned April 2012, though the clauses
were stable 2007→2012 and the $10 fee is still reported in 2026); network
attribution for Nordstrom, Neiman Marcus, FragranceX and Parfumdreams, where
reputable directories directly contradict each other.
