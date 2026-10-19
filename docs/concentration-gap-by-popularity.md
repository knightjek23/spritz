# Concentration gap, ranked by what people actually open

Snapshot after the 0024–0026 repair. Catalog 11,368 · labelled 4,604 · blank 6,764.

The raw gap is misleading. Sorted by popularity instead of size:

| | rows | share of gap |
|---|---:|---:|
| Blank **and** in the top 500 | **149** | 3% |
| Blank and in the top 2000 | 904 | 20% |
| Blank and ranked >2000 or unranked | 3,534 | **80%** |

**The visible problem is 149 fragrances, not 6,764.** That is an afternoon of manual
entry, not a research pipeline. Everything below follows from that.

---

## Tier 1 — fix these by hand (149 rows, top 500)

Ordered by how many top-500 pages currently show nothing.

| top500 | top2000 | blank | best rank | house |
|---:|---:|---:|---:|---|
| 39 | 70 | 90 | **#2** | Chanel |
| 14 | 27 | 42 | **#3** | Maison Francis Kurkdjian |
| 10 | 21 | 43 | #79 | Louis Vuitton |
| 7 | 14 | 23 | **#6** | Tom Ford |
| 6 | 29 | 45 | #101 | Jo Malone London |
| 6 | 20 | 31 | #22 | Mugler |
| 6 | 15 | 31 | #49 | Frederic Malle |
| 4 | 17 | 34 | #95 | Acqua di Parma |
| 4 | 16 | 40 | #97 | Maison Martin Margiela |
| 4 | 16 | 43 | #281 | Memo Paris |
| 4 | 14 | 23 | #20 | Hermès |
| 4 | 9 | 31 | #52 | Dolce&Gabbana |
| 3 | 13 | 19 | #98 | Prada |
| 3 | 12 | 52 | **#7** | Dior |
| 3 | 12 | 45 | #27 | Yves Saint Laurent |
| 3 | 12 | 28 | #206 | Narciso Rodriguez |
| 3 | 11 | 38 | #14 | Giorgio Armani |

…plus 18 houses contributing 1–2 each (Bvlgari, Azzaro, Gucci, JPG, Guerlain,
Issey Miyake, Versace, Parfums de Marly, Carolina Herrera, Comme des Garçons,
Armaf, Montblanc, Rabanne, Viktor&Rolf, Roja Dove, Xerjoff, Casamorati, Tauer).

**Chanel is 39 of the 149 — 26% of the entire visible gap in one house**, and its
best-ranked fragrance is #2 in the catalog. If only one thing gets done, it is Chanel.

### Why these specifically are blank

Every house at the top of this list is a luxury house that refuses discount-retailer
distribution. They are absent from FragranceNet, FragranceShop and Nicchia by
commercial policy, not by matching failure. No amount of matcher work reaches them.

They are, however, trivially findable: Chanel, Dior and MFK publish concentration
plainly on their own product pages. This is the one segment where targeted
research pays, and at 149 rows it is faster to type than to automate.

---

## Tier 2 — 755 more rows (rank 500–2000)

Same character as Tier 1, thinner payoff. Worth doing only after Tier 1 lands, and
worth automating rather than typing. Largest contributors: Chanel (31 more),
Bvlgari (44), Carolina Herrera (57), Comme des Garçons (40), Calvin Klein (40),
Jo Malone (29), Armaf (28), MFK (27).

---

## Tier 3 — 3,534 rows nobody opens (80% of the gap)

| blank | top2000 | best rank | house | note |
|---:|---:|---:|---|---|
| 730 | 22 | #1270 | Bath & Body Works | body mists/splashes — mostly **not** EDT/EDP at all |
| 264 | 20 | #1214 | Al Haramain | has feed presence, missed the 90% prior bar |
| 238 | 3 | #1225 | Demeter Fragrance | sells "Cologne Sprays" — own naming system |
| 117 | 0 | #2046 | Arabiyat Prestige | zero ranked entries |
| 78 | 23 | #1122 | Clive Christian | luxury, no discount distribution |
| 64 | 4 | #1196 | Zara | does not use the EDT/EDP system |
| 62 | 3 | #713 | Victoria's Secret | body care |
| 59 | 1 | #1201 | O Boticário | regional, own system |
| 52 | 1 | #1198 | Fragrance World | clone house |

**For a large part of Tier 3, blank is the correct answer.** Bath & Body Works alone
is 730 rows of body care that has no EDT/EDP concentration to find. Demeter, Zara,
Lush, Victoria's Secret, O Boticário and Sol de Janeiro are the same story. An AI
research pass over Tier 3 would spend most of its budget inventing values for
products that do not have one — repeating the original bug with a better prompt.

---

## Recommendation

1. **Hand-enter Tier 1 (149 rows).** Highest value per unit effort in the whole
   project. Chanel first.
2. **Exclusion rules for body-care and non-EDT/EDP brands.** ~1,300 rows resolved
   correctly to "not applicable" for free. Consider rendering these as
   "not applicable" rather than hiding the field, so absence reads as intentional.
3. **Re-check Al Haramain and Armaf** (502 blank between them, both with real feed
   presence). They failed the 90% house-prior threshold; worth seeing whether they
   are genuinely mixed or just noisy.
4. **Do not build the 6,764-row research pipeline.** After steps 1–3 the remaining
   target is small, low-traffic, and heavily weighted toward products with no
   concentration to find.
