# Bottle Image Sourcing — Research Findings

Deep dive, August 2026. Four parallel research passes: open/CC-licensed
datasets, affiliate networks, commercial product-data vendors, and fragrance
industry ownership. Every claim below traces to a primary source.

**The question asked:** is there a way to get licensed bottle images from the
internet at catalog scale, without emailing 300 perfume houses?

**The answer:** yes, but only one route, and it comes with a condition that
shapes the product. Everything else either has no rights or no coverage.

---

## The headline finding

There is exactly **one** source that grants written image rights at solo-founder
cost: **retailer affiliate product feeds**.

Every other option fails in one of three ways:

1. **Open data, unlicensed images.** The dataset is genuinely open; the photos
   inside it are not. This is the most common failure and the hardest to spot.
2. **Licensed but empty.** Real rights, near-zero fragrance coverage.
3. **Working URLs, zero rights, indemnity on you.** The dangerous category —
   see below.

---

## The trap category: services that hand you working images and grant nothing

These all "work" technically. You could wire 7,000 images in a weekend and feel
like the problem is solved. Each one tells you in its own terms that you have no
rights, which means they have pre-built their defense.

| Service | What their own terms say |
| --- | --- |
| **Go-UPC** | "product images and descriptions belong to third-party owners. **These Terms and Conditions do not grant you permission to use Third Party Content.**" |
| **Barcode Lookup** | "**The Terms and Conditions do not grant you any rights to Third Party Content** … If you require rights to Third Party Content please contact the Third Party Content owner." |
| **UPCitemdb** | Silent on image rights; "Customer warrants and represents that the use of the Service and Data will not violate, misappropriate or infringe the rights of any person or entity." |
| **Icecat** (free + paid, identical) | Images are "**NOT included in the Icecat Information and thus not covered by this License**." Client is "responsible … for securing the necessary permissions from respective manufacturers." Also: no meaningful fragrance coverage — Icecat is IT/consumer-electronics. |
| **GS1 / GDSN** | Delivers image **URL references**, not files or rights. Also publish-to-named-recipient — you cannot subscribe to "all perfume," a brand must affirmatively publish to your GLN. Luxury beauty largely doesn't use GDSN. |
| **FragDB** ($1,000/yr, crypto only) | Claims "commercial use — … mobile apps." Derived from Fragrantica/Parfumo. No disclosure of image provenance or authority to sublicense. Nobody can license rights they never held. |
| **Fragella API** | Hosts bottle images itself, which *feels* like ownership. Terms grant no image license and impose full indemnity: you pay their legal fees for "your infringement of any third-party rights." |

**Rule of thumb that catches all of these:** if a vendor can't tell you which
rights holder authorized the redistribution, they don't have the right to pass
it on, and a paid invoice doesn't change that.

---

## Open / CC-licensed sources — real rights, unusable coverage

**Open Beauty Facts** — the best-licensed option. Photos are CC BY-SA
(version ambiguous between the site and the AWS registry entry, which matters
for attribution terms). Commercial use permitted. But: the whole beauty
database is 67,318 rows, the category taxonomy has only `en:perfumes` /
`en:cologne` with **no EDP/EDT distinction** — the project was never built for
fragrance — and sampling found essentially no designer or niche fragrances.
Realistic coverage of a 7,000-SKU designer catalog: **low single-digit
percent**. Images aren't in the bulk dumps either; you'd pull them per-barcode.

**Wikimedia Commons** — cleanest licensing anywhere (commercial use and
derivatives guaranteed per file). Coverage is antique and museum bottles, brand
logos and shop windows, not current SKU packshots. Realistically **under 100
usable catalog thumbnails**, concentrated in a few icons (No. 5, Shalimar,
J'adore). Worth one harvest pass for the famous handful. Not a strategy.

**Checked and dead:** Datakick/gtinsearch (CC0 data, but "Images are copyright
of their respective owners"), Brocade.io (archived Dec 2025, no images at all),
Open Product Data (OKFN, archived), Amazon Berkeley Objects (**CC BY-NC** —
non-commercial, disqualified despite excellent packshots), Open Images V7
(Google disclaims license status; no SKU mapping), Kaggle Fragrantica dumps
(scraped, uploader CC0 tags are legally worthless), FDA/EU regulatory datasets
(no images at all).

**One caveat that applies to every CC source:** the photographer can only
license their own photograph. A CC BY-SA photo of a sculptural Jean Paul
Gaultier or Guerlain bottle does not clear the bottle design itself, which is
often separately protected. Open Food Facts concedes this in its own legal page.

---

## Stock libraries — structurally impossible

Branded packshots in Getty, Shutterstock and Adobe Stock are almost universally
**Editorial Use Only**, precisely because a visible logo is an uncleared
trademark. Shutterstock's own worked example of editorial-only content is a
Sephora storefront.

iStock adds a second independent blocker even for non-editorial images: you may
not use content "in any way that allows others to **download, extract, or
redistribute content as a standalone file**." A catalog app serving one discrete
image per SKU is close to the definition.

Economically absurd regardless: 7,000 individually licensed images at stock
rates is six figures, with no guarantee your specific SKUs exist.

---

## Enterprise syndication — wrong shape, wrong price

**1WorldSync no longer exists independently** — Syndigo acquired it September
2025. Syndigo pricing runs **$9,645/yr SMB to $337,877/yr enterprise**, all
enterprise sales, no self-serve tier.

More fundamentally, the model is brand-funded publishing: brands pay to push
content out to **authorized retail recipients**. A discovery app has no
purchase-order relationship with Coty or Puig, so there's no hook to qualify.

**Salsify, Akeneo, Productsup are not data sources at all** — they're PIM and
feed-management software. Empty vessels you load your own data into. Buying one
gets you a schema, not photos.

---

## The one route that works: affiliate product feeds

This is the only place an **authorized party affirmatively licenses you their
creative in writing**, because they want you to display it.

### The condition nobody mentions up front

Every network's grant is the same shape, and it is narrower than "get a feed
with images" sounds:

**Awin** (clearest and most quotable — Publisher Terms cl. 10.1):

> "AWIN hereby grants to the Publisher, **for the duration of its participation
> in the Advertiser Program**, a **revocable** … sublicense to publish Advertiser
> Materials, **without modification** … **to the extent necessary to enable the
> Publisher to market the respective Advertiser and its Products**"

Plus cl. 15.2.1: on termination "the Publisher **shall immediately remove any
Advertiser Materials**." And cl. 4.6: removal "**immediately on request**," no
cause needed.

Three consequences that matter for Spritz specifically:

1. **"For the duration of its participation"** — leave or get dropped from a
   program and those images must come down. A 7,000-fragrance library built this
   way develops holes as programs churn.
2. **"To market the respective Advertiser and its Products"** — a Library card
   or trending row showing a bottle with **no affiliate link** arguably falls
   outside the grant. A detail page with a live Buy CTA to that merchant is
   squarely inside it. **This is a product-design constraint, not a footnote.**
3. **"Without modification"** — cropping, background-removing or normalizing to
   a uniform bottle grid is outside the grant. This is the clause a polished app
   breaches first.

Notably, **Awin's terms are silent on caching vs hotlinking** — rehosting is
neither blessed nor banned. That's materially more permissive than Amazon.

**Amazon is a flat no.** Associates IP Licence: "You will **not store or cache
Product Advertising Content consisting of an image**, but you may store a link …
**for up to 24 hours**." Only ASINs may be retained indefinitely. Also PA-API v5
is deprecated (403s now) in favour of the Creators API, and access still
requires qualifying sales first. **Remove Amazon from the plan.**

**CJ** is the same shape but narrower — "limited purposes of Promoting the
Advertiser's Program," harder to stretch to encyclopedia use.

**Webgains** explicitly bans adaptation ("display (**but not adapt**)") and only
passes through rights the advertiser actually held.

**FlexOffers** has a specific landmine: creative "**cannot be combined with those
found in other affiliate networks** for the same or similar products." An
encyclopedia aggregating images from Awin + CJ + FlexOffers is arguably exactly
that.

### The upstream problem no network solves

Bottle photography originates with the fragrance house, not the retailer. A
retailer's feed passes along an image the retailer may only be licensed to use on
its own storefront. **Neither Awin nor CJ indemnifies the publisher for this.**
The affiliate is the exposed party, not the network.

### Network ranking for a solo pre-revenue publisher

| Network | Cost | Bar | Verdict |
| --- | --- | --- | --- |
| **Awin** | £5 refundable | Low, manual review ~24h | **Start here.** "Soft membership" auto-join advertisers give feed access without per-merchant approval — unique among networks. ~200M products via Create-a-Feed. Douglas is the densest fragrance catalog available anywhere. |
| **Rakuten** | Free | **No revenue floor — this was wrong in our playbook** | Only requires a live site with original content. Runs **Sephora, Ulta, FragranceNet**. Friction is at advertiser level, not network. |
| **CJ** | Free | Harder for new sites | Best pure-play roster: FragranceX, **Notino**, Perfumania, Parfumdreams, Parfimo, Brasty. **Watch the dormant-account clauses** — no transaction in 6 months triggers fees; no login in 30 days can deactivate. |
| **Tradedoubler** | Free | Low | Worth it mainly for **EAN/UPC fields** to reconcile feed products against our catalog. |
| **Webgains** | Free | Low | One merchant worth having: Fragrance Direct. |
| Skimlinks | — | — | Skip. API is Managed-tier only; we'd be on Growth. |
| Sovrn | — | — | Skip. No publisher catalog product exists. |
| eBay | — | — | Skip. Approval gate plus seller-uploaded marketplace photos. |
| Amazon | — | — | Skip. Image caching flatly banned. |

**Also corrected:** ShareASale is fully merged into Awin (platform closed end of
2025) — treat as a synonym. The Fragrance Shop's Awin program is **closed**.

**Feed field notes:** Awin's `aw_image_url` is Awin-hosted and stable but only
**200x200**, UK/IE/CA/US only. `merchant_image_url` is full resolution but sits
on the retailer's CDN — subject to hotlink protection, silent URL rotation, and
disappearance on delist. Neither is a permanent asset.

---

## The "300 houses" question — the reframe is half true

Ownership is genuinely concentrated. But three things break the "12 emails"
conclusion:

1. **No major fragrance parent has a self-serve product-image library.** All
   were checked. Corporate newsrooms carry press releases, ESG reports and exec
   headshots — not bottle renders. Dior has real press portals
   (`dior-pr.dior.com`, `diorpress.com`) but both are accreditation-gated.
   Chanel and Hermès have no public press infrastructure at all.
2. **The parent is the wrong addressee.** Imagery lives with brand-level *and
   market-level* PR. One group is 3-5 real conversations, so the top 12 is
   **~40-60 emails**, not 12.
3. **The catalog is mostly long tail.** The top ~12 groups cover roughly
   **40-55%** of a 7,000-entry catalog — not 90%.

| Segment | Share of catalog | Covered by top 12? |
| --- | --- | --- |
| Mainstream designer, in market | ~30-35% | Yes, ~90% of it |
| Designer, discontinued/vintage | ~10-15% | Nominally — **assets often no longer exist** |
| Niche/indie Western | ~25-30% | No |
| Middle Eastern volume houses | ~15-20% | No |
| Celebrity / mass | ~5-10% | Partly |

**The cruel inversion:** consolidation improves coverage per email but destroys
reply rate. L'Oréal legal will not answer a solo founder. Nishane will.

### Who actually holds what (2026, post-consolidation)

- **L'Oréal Luxe** — now the largest. Owns YSL, Lancôme, Mugler, Azzaro,
  Atelier Cologne, and **Creed** (Kering Beauté acquisition completed
  31 March 2026). Licenses Armani, Prada, Valentino, Ralph Lauren, Viktor&Rolf,
  Maison Margiela, Balenciaga, Bottega Veneta. **Gucci moves from Coty to
  L'Oréal on 30 June 2027** — so Gucci is a Coty ask today.
- **Inter Parfums** — one group, not two. Inter Parfums Inc (NASDAQ: IPAR) owns
  72% of Interparfums SA Paris. ~25 designer brands (Montblanc, Jimmy Choo,
  Coach, Van Cleef, Boucheron, Lacoste, Moncler, Karl Lagerfeld, DKNY,
  Ferragamo, GUESS…), essentially all licensed, one comms function, small-cap
  culture. **Highest expected value of any single contact.**
- **Coty** — ~18 prestige (Burberry, Calvin Klein, Chloé, Davidoff, Hugo Boss,
  Marc Jacobs, Tiffany, Gucci until 2027).
- **Puig** — Rabanne, JPG, Carolina Herrera, Nina Ricci, Penhaligon's,
  L'Artisan, Byredo, Dries Van Noten.
- **Estée Lauder** — Jo Malone, Le Labo, Kilian, Frédéric Malle, Tom Ford,
  AERIN. Only major with something resembling a media-resources section.
- **LVMH P&C** — Dior, Guerlain, Givenchy, Kenzo, Loewe, Acqua di Parma, MFK.
  No group-level shortcut; must go per-maison.
- **EuroItalia** — Versace, Moschino, Dsquared2, Missoni. Easy to miss.
- **Chanel, Hermès** — fully in-house, private, no press infrastructure. Hardest
  targets in the industry.

**Delete from any outreach list:** dsm-firmenich, Givaudan, IFF, Symrise,
Eurofragance, Robertet, Mane. These are B2B fragrance *creation* houses — they
compose the juice, own no consumer brands, and hold no product imagery.

---

## Recommended sequence

1. **Awin.** £5, low bar, soft-membership auto-join advertisers, Douglas.
   Generate a fragrance-category Create-a-Feed and run `pnpm backfill:images`.
2. **Rakuten.** Free, no revenue floor (our playbook was wrong). Sephora, Ulta,
   FragranceNet.
3. **CJ.** For FragranceX and Notino specifically. Diarise a monthly login.
4. **Tradedoubler.** Mainly for EAN/UPC reconciliation.
5. **Then, and only then, brand outreach** — Tier 1 being Inter Parfums, Coty,
   Puig, Estée Lauder, L'Oréal Luxe. Do this **after** there are usage numbers.
   "We have 40,000 users" converts with brand PR; "I'm building an app" does not.
6. **User-uploaded photos** for the long tail. The only source nobody can revoke.

## Two things to decide before building on feeds

- **The link condition.** Detail pages already carry a Buy CTA, so they fit the
  grant. Library cards, house scrollers and trending rows currently show bottles
  with no merchant link — that's the exposed surface. Either make those images
  link out, or source them differently.
- **The modification clause.** A uniform normalized bottle grid conflicts with
  "without modification" / "not adapt." Design around raw merchant images, or
  accept visual inconsistency.
