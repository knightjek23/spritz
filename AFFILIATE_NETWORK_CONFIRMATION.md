# Affiliate Network Confirmation — All 50 Sites

Verified August 2026. Companion to `FRAGRANCE_SITES_CATALOG_DEPTH.md`.

**Evidence tiers.** **T1** = the retailer's own affiliate page names the network.
**T2** = a network merchant profile. **T3** = third-party directory only, treat
as indicative. Anything T3 with no corroboration is flagged.

---

## ⚠️ Nicchia Luxury — external evidence says Awin, and there are TWO programmes

You said Rakuten. Everything I can reach from outside says Awin, and it found
**two** programmes, not one:

| Programme | Awin ID | Note |
| --- | --- | --- |
| Nicchia Luxury **UK** | 123544 | 30-day cookie |
| Nicchia Luxury **IT** | **123542** | **The full-catalogue one** — "over 180 selected brands" |

Supporting evidence: Affilitizer states "Nicchia Luxury IT runs its affiliate
program on AWIN and nowhere else." LinkMyDeals lists Awin plus six sub-networks
(Shopnomix, BrandReward, DigiDip, CueLinks, Ecomnia, MRGE) and no Rakuten. Their
own Shopify site has no `/affiliate` page, no footer partner link, and no
Refersion/GoAffPro/UpPromote install, so there's no in-house programme either.

The signal that makes this more than a null result: both Affilitizer and
LinkMyDeals **do** index Rakuten inventory and correctly identify other
merchants as Rakuten. They can see Rakuten and didn't find Nicchia there.

**But I can't settle it and you can.** Rakuten's advertiser directory is
login-gated, so external absence isn't proof. You're the one holding the
approval. Two ways to check in under a minute:

1. Look at which dashboard lists Nicchia under your approved programmes.
2. Open `nicchialuxury.com`, view source, and search for `dwin1.com` (Awin)
   versus `linksynergy` (Rakuten). My fetch tool strips script tags so I
   couldn't run this myself.

**Either way, worth knowing:** if it is Awin, apply to **123542 (IT)** as well.
That's the full catalogue. The UK programme is the smaller one.

---

## Confirmed programmes

### Corrections to earlier notes

| Site | Was recorded as | Actually |
| --- | --- | --- |
| **Nordstrom** | Rakuten (conflicting) | **Impact** — T1, their own page. Conflict resolved. |
| **Perfume.com** | None found | **Impact** — T1, own footer. 8,810 fragrances, so this matters. |
| **Twisted Lily** | None found | **Awin 20067**, 10% / 30 days |
| **Scent Split** | In-house, unspecified | **Refersion** — 10% of sale, **90-day cookie**, no coupon affiliates |
| **Ounass** | ArabClicks | **Partnerize** via Al Tayer — and the only Gulf merchant with a **confirmed product feed** |
| **Nykaa** | Cuelinks | **In-house portal** at `affiliate.nykaa.com/register` (Cuelinks is a sub-route) |

### US / Canada

| Site | Network | Signup | Rate / cookie | Tier |
| --- | --- | --- | --- | --- |
| FragranceNet | **Rakuten** | `signup.linkshare.com/publishers/registration/landing?mid=216&apply=1` | not stated | T1 |
| FragranceX | **CJ** | `public.cj.com/signup/publisher?advertiserId=1024283` | not stated | T1 |
| Perfume.com | **Impact** | `app.impact.com/campaign-promo-signup/Perfumecom.brand` | not stated | T1 |
| Perfumania | **CJ** 904674 | `signup.cj.com/member/brandedPublisherSignUp.do?air_refmerchantid=904674` | not stated | T1 |
| Jomashop | **CJ** 2746548 | `signup.cj.com/member/signup/publisher/?cid=2746548#/branded` | 4–10%, **feed confirmed** | T1 |
| Sephora US | **Rakuten** | `ra-join-sephora@mail.rakuten.com` | not stated | T1 |
| Ulta | **Impact** | `app.impact.com/campaign-campaign-info-v2/Ulta.brand` | not stated | T1 |
| Nordstrom | **Impact** | `app.impact.com/campaign-promo-signup/Nordstrom.brand` | not stated | T1 |
| Bloomingdale's | **Rakuten** mid 13867 | `signup.linkshare.com/...&mid=13867` | not stated | T1 |
| Walmart | **Impact** | `affiliates.walmart.com` | up to 4%, **feeds** | T1 |
| Twisted Lily | **Awin** 20067 | `ui.awin.com/publisher-signup/us/awin/step1?advertiser=20067` | 10% / 30d | T1+T2 |
| Scent Split | **Refersion** | `scentsplit.com/pages/affiliate-registration` | 10% / **90d** | T1+T2 |
| Lattafa USA | **GoAffPro** (hidden) | `lattafa-usa.com/a/goaffpro` | not published | T1 technical |
| MaxAroma | Ascend/Partnerize | `ascendpartner.com/affiliate/registration?refid=158960` | — | **T2 weak** |
| Dillard's | via FlexOffers | `flexoffers.com/affiliate-programs/dillards-inc-affiliate-program/` | 2.4% / 1d, **feeds** | T2 |
| Target | Impact | `partners.target.com` | 0–8% / 7d | T3 |
| Macy's | Rakuten (likely) | own page robots-blocked | ~6% / 7–10d | **T3** |

### Europe

| Site | Network | ID | Tier |
| --- | --- | --- | --- |
| **Notino** | **CJ** | UK 4612495, DE 4541231, CZ 4510889 | T1 |
| Douglas | **Awin** | DE 10076, AT 12460, CH 12461, PL 10071, CZ 17111, + others | T1+T2 |
| Nocibé | **Awin FR** | **122702** | T1+T2 |
| Flaconi | **Awin** | DE 14598, AT 18187, CH 83601 | T1 |
| Parfumdreams | **Awin** | DE 84317, IE 84325 | T3 |
| allbeauty | **Awin** | UK 911, US 7565 | T1+T2 |
| Escentual | **Awin** | 2991 | T1 — 7.5%, 30d, **feed of 6,500 products** |
| Perfume Click | **Awin** | 6561 | T2 — daily feed |
| The Fragrance Counter | **Awin** | 20978 | T2 — daily feed |
| Perfume Shopping | **Awin** | 5901 | T2 — 5%, **28d** |
| Space NK | **Awin** | UK 59805, IE 59801, US 59807, SE 86623, NL 67332 | T2 |
| Lookfantastic | **Awin** | UK 2082, US 29067, IE 29631, EU 10591 | T2 — feeds mandatory |
| Cult Beauty | **Awin** | 29063 | T2 — up to 15% |
| Marionnaud | **Awin FR** | **93671** | T3 — 11% |
| Sephora FR | **Awin** | 6964 | T3 |
| ICI Paris XL | **Awin NL** | 16319 | T3 — moved off Admitad Sep 2025 |
| Primor | **Awin ES** | 25464 | T2 — 1.56% |
| Druni | **Awin ES** | 16265 | T2 |
| Perfume's Club | **Awin ES** | 12705 | T1+T2 |
| Pinalli | **Awin IT** | 16713 | T2 |
| Niche Beauty | **Awin** | DE 12588, US 114578 | T1+T2 |
| Nicchia Luxury | **Awin ×2** | **UK 123544, IT 123542** | T2+T3 — see above |
| The Perfume Shop | **Rakuten** | — | T1 |
| Liberty London | **Partnerize** | `join.partnerize.com/PHG/en` | T1 — **daily feed** |
| Selfridges | **Partnerize** | — | T3 |
| John Lewis | **Impact** | 12148 | T3 |
| MyOrigines | **Tradedoubler** | 376565 | T3 — left Moonrover Jan 2026 |
| Brasty | **CJ** | 4727029 | T3 |
| Harrods | **Rakuten + Partnerize** | — | **migration in progress, see conflicts** |

### Middle East / Asia / Oceania

| Site | Network | Signup | Note | Tier |
| --- | --- | --- | --- | --- |
| **Ounass** | **Partnerize** | `join.partnerize.com/altayergroup` | 30d cookie, **product feeds** | T1 |
| Faces | Own + ArabClicks | `faces.ae/en/Affiliates-Program.html` | **up to 15%** | T1 |
| Namshi | ArabClicks | `arabclicks.com/signup/` | **90d cookie** | T2 |
| Strawberrynet | FlexOffers + ArabClicks | multiple | 3.6%/45d or 30d by network | T1/T2 |
| Noon | **In-house** | `affiliates.noon.com/en` | up to 10% | T1 |
| Nykaa | **In-house** | `affiliate.nykaa.com/register` | 48h add-to-cart window | T1 |
| Tira | vCommission / Cuelinks | `vcommission.com/affiliate/signup/` | 30d vC vs 7d Cuelinks | T2 |
| My Perfume Shop AU | **Commission Factory** 89029 | `dashboard.commissionfactory.com/Register/` | 6.5% / 30d, **covers AU+NZ+UK+UAE** | T2 |
| Chemist Warehouse | **Rakuten AU** | — | 0.8–4% / 14d | T2 |
| Ajmal (GCC) | ArabClicks | `arabclicks.com/signup/` | **60d cookie** | T2 |
| Ajmal India | **GoAffPro** (hidden) | `in.ajmal.com/a/goaffpro` | unlinked from site | T1 technical |
| Swiss Arabian | **Affiliatly** | `affiliatly.com/af-1012862/affiliate.panel?mode=register` | US entity | T1 |
| Afnan | **Upfluence** | `ambassador.upfluence.co/afnan-general` | — | T1 |
| Al Haramain (NA) | In-house | `alharamainperfume.online/pages/affiliate-registation` | **distributor, not brand HQ** | T1 |
| Golden Scent | DCMnetwork | — | **PAUSED** | T2 |
| Sephora ME | DCMnetwork | — | **PAUSED**; Squad is gifting only | T2 |

---

## No programme at all — direct outreach only

Checked their own pages, footers, and probed for Refersion, GoAffPro, UpPromote,
Social Snowball, LeadDyno and Affiliatly. Genuine negatives:

**The Oud Store** (the deepest Arab-house catalog anywhere), **First in
Fragrance**, **Bloom Perfumery**, **Jovoy Paris**, **Luckyscent**, **Osswald
NYC**, **Indigo Perfumery**, **FragranceBuy.ca**, **The Perfumed Court**,
**Perfume Clearance Centre AU**, **Peter's of Kensington**, **Rasasi**,
**Arabian Oud**, **Armaf**, **Ajmal USA**, **Scentido**, **Perfume Booth**.

Caveat: Shopify Collabs is invitation-only and invisible from outside, so it
can't be ruled out for any of these.

---

## Unresolved conflicts — don't act without checking

- **Saks Fifth Avenue.** Three-way contradiction. FlexOffers lists 1.6%/14d and
  marks it **not currently offered**; UpPromote says CJ at 2.4–6% but hands out
  a FlexOffers link; Takeads lists it as their own merchant. No affiliate page
  on saks.com. Contact Saks directly.
- **Harrods runs on two networks simultaneously.** Rakuten since May 2024
  (3 programmes), Partnerize since Jan 2026 (4 programmes: ME/ROW/UK/US). Reads
  as a migration. **Join Partnerize**, it's the newer one.
- **The Perfume Spot.** ShareASale (agency launch announcement) vs CJ 820608
  (directory). Both T3. Possibly a migration.
- **Parfimo.** Weakest result in the set. Own affiliate page exists but returns
  no content; LinkMyDeals says it's on none of 120+ networks; FlexOffers lists
  it but flags "not currently offering." Sister brand Brasty is CJ 4727029, so
  Parfimo is *probably* CJ. Inference, not confirmation.
- **Neiman Marcus.** Their `/NM/Affiliate-Reg-Page/` exists and is indexed but
  renders only site chrome. Only T3 corroboration.
- **Golden Scent.** DCMnetwork says Paused; Shopper.com says Active at 5–10%.
  Shopper.com is a creator-storefront aggregator, likely surfacing stale data.

**Context worth knowing:** the Rakuten–impact.com alliance announced April 2026
is almost certainly why directories are contradicting each other on network
attribution right now. Prefer T1 own-page evidence over any directory this year.

---

## The strategic finding: no network covers the Arab houses

Of the eight houses that matter for your long tail — Lattafa, Armaf, Al
Haramain, Rasasi, Ajmal, Swiss Arabian, Maison Alhambra, Afnan — **exactly one
is on any affiliate network.** Ajmal, on ArabClicks, GCC only.

Admitad's Middle East roster is electronics, travel and marketplaces with zero
fragrance houses. Commission Factory is AU/NZ and carries none. DCMnetwork's two
fragrance campaigns are both paused.

The houses that *do* run programmes run them **in-house, on cheap Shopify apps,
one market at a time**, and none are discoverable through a network. Two of them
aren't even linked from their own websites — Lattafa USA and Ajmal India both
have live GoAffPro installs with no footer link. You would never find them by
browsing. They only surfaced from probing the app-proxy path directly.

So there is no single door. The realistic portfolio:

1. **ArabClicks** for GCC *retail* — Ajmal, Faces, Ounass, Namshi, Strawberrynet,
   Oud Milano, Rose Mary, Scent4me. Nine relevant merchants, 30–90 day cookies.
2. **Partnerize** via Al Tayer for **Ounass** — the single highest-value Gulf
   signup, because it's the only one confirming both a 30-day cookie and a
   product feed.
3. **Commission Factory** for My Perfume Shop — one approval covers AU, NZ, UK
   and UAE, with Armaf 235 / Ajmal 130 / Afnan 71 inside.
4. **Five separate direct signups** for the houses: Lattafa USA and Ajmal India
   (GoAffPro), Swiss Arabian (Affiliatly), Afnan (Upfluence), Al Haramain NA
   (distributor).
5. **Direct email** to The Oud Store, which has more Lattafa SKUs (339) than any
   networked retailer and no programme at all.
