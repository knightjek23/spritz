# Scoring Spritz's 350 houses on evidence

Spritz's ~350 catalog houses now have one calibrated 0-100 popularity score each (348 rows after two alias merges). Nine houses clear 90: **Chanel and Dior (98), YSL (95), Armani and Valentino (92), Carolina Herrera and Sol de Janeiro (91), and Jean Paul Gaultier and Rabanne (90)**. Every one of them rests on a primary source: Circana's US top five, L'Oréal's and Puig's own rankings, or LVMH's Sauvage claim. Below that, the scale gets thinner. Only **42 rows (12%) are high confidence, 122 are medium and 184 are low**. About 160 rows cite something fetched, but most of those citations only prove a retailer listing, not popularity. And 152 houses crowd into the 20-39 band, where the scores are informed placeholders. That makes the score reliable for the decisions that matter most, like separating designer flagships from niche and micro labels, and weak for ordering two small indie houses. My recommendation is to blend it in at **10%**, scaling the 25/25/50 weights down to 22.5/22.5/45. For the 123 houses with no FragranceNet offers, raise it to **20%**. That gap is where FragranceNet-based signals go blind, and it covers brands like Kayali, Sol de Janeiro and Bath & Body Works. No Fragrantica data was used anywhere.

## Public data supports bands at the top, not exact ranks

The anchors come from the few brand-level figures that are public, because Circana's numbered ranks sit behind paid reports. Circana's 2024 US list of top fragrance brands across all tiers names **Chanel, Dior, YSL, Sol de Janeiro and Valentino** ([GCI Magazine](https://www.gcimagazine.com/brands-products/fragrance-home/news/22933512/decoding-the-20242025-fragrance-boom-prestige-x-value)). Puig says Rabanne, Carolina Herrera and Jean Paul Gaultier are three of the world's top 10 fragrance brands ([Puig](https://www.puig.com/en/newsroom/puig-achieves-strong-growth-and-record-sales/)). LVMH says Sauvage is still the world's best-selling men's fragrance ([Cosmetics Design Europe](https://www.cosmeticsdesign-europe.com/Article/2026/01/28/lvmh-boosts-beauty-profit-despite-zero-sales-growth-in-2025)). L'Oréal, which calls itself No. 1 in fragrance worldwide, calls Armani a "billionaire brand" and puts Libre, Paradoxe, La Vie Est Belle, Born in Roma, Polo and Acqua di Giò in the global top 15 ([L'Oréal](https://www.loreal-finance.com/en/annual-report-2025/luxe/)). Chanel and Dior are tied at 98 on purpose: Circana lists Chanel first, Dior has the highest monthly fragrance search volume ([NewBeauty](https://www.newbeauty.com/view/popular-luxury-fragrance-brands-2025)), and no public data settles which leads.

The next band is set by the billion-dollar line. **Jo Malone London and Tom Ford Beauty are now billion-dollar brands**, and Le Labo and Kilian are among Estée Lauder's three fastest-growing brands ([Glossy](https://www.glossy.co/beauty/jo-malone-and-tom-ford-are-now-billion-dollar-brands-as-the-estee-lauder-companies-reports-return-to-sales-growth/)). Awareness data adds a second, mass-market view. Morning Consult's May 2026 survey gives **Bath & Body Works the highest mental market share (~17%)**, followed by Calvin Klein (~8%) and then Ralph Lauren, Chanel and Dior (~7% each). Calvin Klein also has the highest aided awareness, at ~64% ([Morning Consult](https://morningconsult.com/articles/fragrance-category-brand-research)). The same survey shows why awareness can't be the only input. MFK, Le Labo and Byredo are known by just 3-5% of adults, but they convert 14-22% of people who know them into recent buyers. A score built purely on reach would push those houses toward zero, so they land at 70-74 on a mix of reach and pull.

Below the top band, I scored on a revenue ladder wherever a figure existed. **Parfums de Marly ($780M retail, +42%)** sits at 78, Initio ($220M) at 65 ([Cosmetics Business](https://cosmeticsbusiness.com/parfums-de-marly-and-initio-owner-nears-one-billion-in-sales)), Phlur (over $150M expected retail) at 68 ([Net Influencer](https://www.netinfluencer.com/influencer-founded-fragrance-brand-phlur-acquired-by-tsg-consumer-partners/)), and Lacoste ($108M brand sales, +28%) at 64 ([Zacks](https://www.zacks.com/stock/news/2821197/interparfums-q4-sales-rise-7-yoy-key-brands-boost-growth)). Lattafa's **$100M+ on Amazon and $63M+ on TikTok Shop** ([Euromonitor](https://www.euromonitor.com/article/the-rise-of-arabian-fragrances-from-regional-tradition-to-global-opportunity)) and its **+105% Spate popularity growth** ([Happi](https://www.happi.com/breaking-news/ysl-beauty-lattafa-lead-top-growing-fragrance-brands-in-the-us/)) put it at 76, ahead of Lacoste. On reach, it outranks most mid-tier licensed designers.

## Six researchers, one scale: 67 adjustments and 2 merges

The six part files used one rubric but read it differently. Part 1 treated the rubric's examples as hard band limits. Parts 2, 4 and 5 scored regional giants on global strength. Part 3 leaned on Interparfums and Coty filings. I recalibrated against the industry-rankings note and moved 67 scores. The table below groups the moves. In the master table, each moved row is tagged `[adj. old→new]`.

| Adjustment | Houses (old → new) | Why |
|---|---|---|
| Top-tier re-anchoring to Circana US | Valentino 87→92, Sol de Janeiro 86→91, Dior 97→98, Armani 93→92, Rabanne 91→90, Prada 87→89, Lancôme 90→88 | Valentino and Sol de Janeiro are Circana US top-five brands, but parts 1 and 3 had them below Puig's brands. Sol de Janeiro is also No. 1 at Sephora North America and No. 1 in fragrance on Amazon ([Cosmetics Business](https://cosmeticsbusiness.com/loccitane-group-sales-2025-full-year-watershed-private-sol-de-janeiro)) |
| Billion-dollar and awareness evidence | Jo Malone 72→84, Calvin Klein 82→86, Ralph Lauren 82→86, Azzaro 78→80 | Part 1 used Jo Malone as a 60-74 rubric example, but Estée Lauder confirms it as a $1bn brand. Calvin Klein and Ralph Lauren match Chanel and Dior on Morning Consult mental share. Azzaro's search is up 95% |
| Lattafa uncapped | Lattafa 59→76, Armaf 55→60, Afnan 56 (from 52) | Part 1 pinned Lattafa to the rubric's 40-59 example despite the strongest Gulf sales evidence. Armaf and Afnan move with it, but less, because their only source is a reseller blog |
| Niche revenue ladder | PdM 73→78, Creed 72→75, Le Labo 72→74, MFK 73→74, Kilian 68→72, Byredo 68→70, Phlur 72→68, Initio 62→65, Lacoste 62→64 | Scores now follow published retail sales and parent growth claims. Phlur was the one inversion: it sat above Initio on a smaller number |
| US lens for regional giants | Natura and O Boticário 58→42, Rituals 55→42, Antonio Banderas 50→42, Yves Rocher 50→38, 4711 46→34, Joop! 45→38, Kenzo 66→62, Zadig & Voltaire 65→60, Nina Ricci 55→50, Cacharel 50→44, Oriflame 45→30, Jequiti 40→25, plus 18 smaller European, LatAm and Gulf-regional houses | Spritz ranks for a US audience buying through US retailers, so strength in Brazil, Europe or the Gulf without US doors is discounted 4-16 points |
| Fragrance share, not company size | L'Occitane 60→52, Lush 55→48, The Body Shop 50→40, Nest 60→55, Fendi 60→55, Aesop 60→55, Estée Lauder (own line) 78→70 | This applies the rule part 6 used for Rituals and Rare Beauty to every part: score the fragrance business, not the parent's revenue |
| Celebrity normalization | Britney Spears 58→52, Paris Hilton 50→48, J.Lo 52→48, Rihanna 60→55, Beyoncé 48→45 | Lifetime licensee totals like Paris Hilton's $2B since 2004 describe past peaks. Current lines sell mostly through discounters or single SKUs |
| Billie Eilish vs Sabrina Carpenter (kept) | Billie Eilish 77, Sabrina Carpenter 63 | The 14-point gap holds. Billie Eilish has a Circana unit rank (No. 2 brand by units, No. 1 Ulta SKU, relayed from WWD by [Scento](https://www.scento.com/blog/celebrity-fragrance-statistics-2026)). Sabrina's >$100M is the licensee's global retail claim, and YipitData puts her US sales at only ~$11M ([Glossy](https://www.glossy.co/beauty/inside-sabrina-carpenters-plan-for-global-fragrance-domination/)) |
| Bath & Body Works cap | 89 (kept) | It has the largest sales and mental share on the list, but $7.3bn ([Yahoo Finance](https://finance.yahoo.com/news/bath-body-works-q4-earnings-165004715.html)) is mostly body care and candles. It's capped at the top of 75-89 so its 848 catalog entries don't outrank fine-fragrance flagships |
| Misidentified and missing rows | Fine Ry 15→50; Guerlain added at 82 | Part 5 couldn't identify "Fine Ry". It's Fine'ry, whose The New Rouge was Circana's top US mass launch of 2024 ([GCI](https://www.gcimagazine.com/brands-products/fragrance-home/news/22933512/decoding-the-20242025-fragrance-boom-prestige-x-value)). Part 1 listed 59 rows but left out Guerlain. I scored it from LVMH's 2025 highlights and background knowledge |

Two pairs were true aliases, so I merged them. **Frederic Malle Editions de Parfums (part 2: 60) and Frederic Malle (part 5: 68) became one row at 64**, and **Mpf (20) became part of My Perfumes (40)**. The catalog has no separate "Lattafa" or "Paco Rabanne" row, since Lattafa Perfumes and Rabanne each appear once, so nothing needed collapsing there. Roja Dove (now trading as Roja Parfums), Maison Martin Margiela (now Maison Margiela) and Victoria S Secret are single rows with corrected display names. I deliberately kept sub-brands as separate rows, scored at or below their parent: Maison Alhambra (45) and RAVE (35) under Lattafa, Arabiyat Prestige (40) and Otoori (25) under My Perfumes, French Avenue (44) and Aromatix X French Avenue (28) under Fragrance World, Zimaya (32) under Afnan, and Casamorati 1888 (30) under Xerjoff. Folding them into their parents would hand cheap dupe lines a 76 they haven't earned. Spritz should still map these aliases at ingest so new catalog spellings resolve to the same house.

## Fewer than half the scores rest on a sourced figure

The table is only as strong as its weakest band, and the bands differ a lot. All nine 90+ rows and 20 of the 32 rows at 75-89 cite a source. But much of the 75-89 band is background judgment that wasn't re-verified this run, including Gucci, Dolce&Gabbana, Givenchy, Mugler, Hugo Boss, Burberry, Bvlgari, Hermès, Marc Jacobs and **Victoria's Secret (84)**. Those scores are almost certainly right in direction, but no 2025-26 source was fetched for them. Across the whole table, **188 of 348 rows (54%) are tagged Background**. Of the 160 tagged Sourced, roughly 45 cite an actual sales figure, growth rate or ranking. The rest cite a retailer listing, a brand page or a press mention, which shows a house exists and where it sells, not how popular it is. In the 20-39 band, 98 of 152 rows are pure background judgment. No Instagram counts were collected in any part, so social reach isn't in any score.

The researchers also leaned on a secondary source. Several part-1 and part-2 claims are relayed through Scento's blog, which the industry-rankings note had excluded as an aggregator: YSL as the No. 1 US men's brand, Valentino Uomo at No. 2, and the celebrity sales totals. For the top tier, I replaced those with primary sources. Billie Eilish's Circana unit rank still rests on Scento's relay of WWD. Two minor rows lean on enthusiast databases, Parfumo for Naseem and Basenotes for Slumberhouse. Neither is Fragrantica, but they're crowd sources too.

Spritz's own data gives a useful cross-check. Comparing scores against `fragrancenet_offers` in the input file turns up two kinds of mismatch. Some houses score low but have deep FragranceNet stock, which suggests discounter reach the researchers missed: **Demeter (32, 114 offers)**, Paris Corner (36, 40), Mind Games (30, 27), Les Liquides Imaginaires (28, 29), Zimaya (32, 26), French Avenue (44, 29) and Tiziana Terenzi (36, 24). Others score high but have almost no FragranceNet presence because they sell through their own stores or exclusive retail: Bath & Body Works, Victoria's Secret, Zara, Kayali, Sol de Janeiro, MFK, Margiela, Phlur, Glossier and Billie Eilish. The first group is the best place to spend a verification pass. The second group is the reason the blend needs the gap-filling rule below.

These houses need a check first. Victoria's Secret, Zara and the unsourced designer flagships (Gucci, D&G, Givenchy, Mugler, Hugo Boss) carry the most ranking weight with the least evidence. Guerlain was scored by me, not a researcher. Fine'ry's identity needs confirming against the catalog's "Fine Ry" entries. Armaf and Afnan rest on a reseller blog. Licences are in motion: Gucci and Creed are moving to L'Oréal with Kering Beauté, the Versace licence after Prada's acquisition is unconfirmed, Dunhill's licence has lapsed and Jaguar's status is unclear. Ten houses couldn't be identified or placed at all and are placeholders at 10-22: Bujairami, D Annam, Pearfat Parfum, Al Jazeera Perfumes, Anfar London, Sucreabeille, Mith, Atralia, Jo Milano Paris and Animale.

## Blend at 10%, and lean on it where FragranceNet is blind

The weight is set by how much new information the house score adds, and that differs by fragrance. For a fragrance with FragranceNet data, the AI popularity score (50%) almost certainly already includes house fame, because a model that knows Sauvage knows Dior. A large house weight would count that fame twice. So my recommendation for the general case is **final = 0.90 × (0.25·TopSellers + 0.25·Reviews + 0.50·AI) + 0.10 × House**, which works out to 22.5/22.5/45/10. Use the raw 0-100 house score, not a percentile. The raw scale is band-calibrated, while a percentile would blow up meaningless differences inside the crowded 20-39 band. At 10%, the full spread from Dior to a micro-indie is about 8 points. That's enough to break ties and lift a well-known house's lesser-known scents above an obscure label's, but not enough for a weak Dior flanker to beat a Lattafa bestseller with strong sales and reviews.

The case changes for fragrances with no FragranceNet signal. **123 houses have zero FragranceNet offers, covering 2,448 of the 13,343 parsed catalog fragrances.** Many of them are big precisely because they sell direct: Bath & Body Works, Victoria's Secret, Zara, Kayali, Lush and Avon. If missing Top Sellers and Reviews values are treated as zero, these fragrances can score at most 50%, and they sink below discount-channel clones. Instead, renormalize over the signals you have and give the house score more of the load: **final = 0.80 × AI + 0.20 × House** when both FragranceNet signals are missing, and 0.85 × (available components, reweighted) + 0.15 × House when only one is missing. The house score works as an informed prior exactly where Spritz has the least direct evidence.

Each weight has a cost. At 5%, the house score is close to decorative and Kayali-type gaps stay. At 15-20% across the board, every flanker of a top house moves up together, and Bath & Body Works' 848 entries could crowd the top of browse lists. The cap at 89 limits that, but the AI score still has to separate a Champagne Toast from a forgotten seasonal mist. Low-confidence rows are a smaller worry than they look, because they sit mostly in 0-39, where 10% moves a fragrance by 2-4 points. The scores that most need to be right are the unsourced 75-89 designers, and they're on the check list above. Before shipping, test 5, 10 and 15% against a hand-labelled top-100 list, rank-correlate each version with in-app engagement once there's enough volume, and recompute the house scores twice a year. Licences and viral houses move faster than annual reports.

## Complete house score table (348 rows covering all 350 catalog names)

Rows are sorted by score. "Sourced" means the evidence cites a fetched page (often only a retailer listing). "Background" means the score comes from researcher knowledge of parent, licence and distribution and wasn't re-verified. `[adj. a→b]` marks a calibration change made in this report.

| # | House | Score | Band | Confidence | Key evidence |
|---|---|---|---|---|---|
| 1 | Chanel | 98 | 90-100 | high | Sourced: Circana US top-5 fragrance brand 2024 (listed first); Morning Consult aided awareness ~62% |
| 2 | Dior | 98 | 90-100 | high | Sourced: Circana US top-5 brand 2024; LVMH says Sauvage is the world's best-selling men's fragrance; highest Spate search volume (18,600/mo) [adj. 97→98] |
| 3 | Yves Saint Laurent | 95 | 90-100 | high | Sourced: Circana US top-5 brand 2024; L'Oréal calls Libre the No. 1 feminine fragrance worldwide; Spate +48% |
| 4 | Giorgio Armani | 92 | 90-100 | high | Sourced: L'Oréal "billionaire brand"; Acqua di Giò in global top 15; Spate search +48% (18,000+/mo) [adj. 93→92] |
| 5 | Valentino | 92 | 90-100 | high | Sourced: Circana US top-5 brand 2024 and holiday winner; Born in Roma in L'Oréal global top 15; Spate search +79% [adj. 87→92] |
| 6 | Carolina Herrera | 91 | 90-100 | high | Sourced: Global top-10 fragrance brand and one of Puig's best-selling scents (FY2025); Good Girl |
| 7 | Sol de Janeiro | 91 | 90-100 | high | Sourced: Circana US top-5 brand 2024; No. 1 beauty brand at Sephora North America and No. 1 fragrance brand on Amazon; ~€885m implied sales [adj. 86→91] |
| 8 | Jean Paul Gaultier | 90 | 90-100 | high | Sourced: Global top-10 fragrance brand and one of Puig's best-selling scents (FY2025); Le Male and Le Beau |
| 9 | Rabanne (formerly Paco Rabanne) | 90 | 90-100 | high | Sourced: Puig names it a global top-10 fragrance brand (FY2025) [adj. 91→90] |
| 10 | Bath & Body Works | 89 | 75-89 | high | Sourced: $7.3bn FY2025 net sales (mostly body care and candles); Morning Consult top mental market share (~17%). Capped at 89 |
| 11 | Prada | 89 | 75-89 | high | Sourced: Paradoxe in L'Oréal global top 15; Spate search ~+100% [adj. 87→89] |
| 12 | Lancôme | 88 | 75-89 | high | Sourced: La Vie Est Belle in L'Oréal global top 15 [adj. 90→88] |
| 13 | Tom Ford | 88 | 75-89 | high | Sourced: Estée Lauder billion-dollar brand (FY2026) and a driver of its +10% fragrance growth; Spate search +35% |
| 14 | Calvin Klein | 86 | 75-89 | high | Sourced: Morning Consult: highest aided awareness (~64%) and No. 2 mental market share (~8%) after Bath & Body Works [adj. 82→86] |
| 15 | Gucci | 86 | 75-89 | high | Background: Gucci Flora and Bloom are among Coty's largest prestige lines |
| 16 | Ralph Lauren | 86 | 75-89 | high | Sourced: Morning Consult mental market share ~7% (level with Chanel and Dior), awareness ~60%; Polo in L'Oréal global top 15 [adj. 82→86] |
| 17 | Versace | 85 | 75-89 | high | Sourced: Morning Consult aided awareness ~53%; Spate search +52%; Eros mass bestseller |
| 18 | Dolce&Gabbana | 84 | 75-89 | high | Background: Light Blue and The One are global bestsellers |
| 19 | Givenchy | 84 | 75-89 | high | Background: L'Interdit and Gentleman |
| 20 | Jo Malone London | 84 | 75-89 | high | Sourced: Estée Lauder confirms Jo Malone London is a billion-dollar brand (FY2026) [adj. 72→84] |
| 21 | Victoria's Secret (catalog: Victoria S Secret) | 84 | 75-89 | med | Background: Bombshell is one of the biggest-volume US fragrances; Beauty is a multi-billion-dollar segment of VS&Co |
| 22 | Mugler | 83 | 75-89 | high | Background: Alien and Angel are long-running global bestsellers |
| 23 | Ariana Grande | 82 | 75-89 | med | Sourced: Licensee claims >$1B global retail sales for the franchise in 2024; her division was the top masstige division in 2024 per Circana (via Happi) |
| 24 | Guerlain | 82 | 75-89 | med | Sourced: LVMH named Guerlain (Aqua Allegoria, L'Art & La Matière) among its 2025 Perfumes & Cosmetics highlights; Shalimar and L'Homme Idéal. Part 1 omitted... |
| 25 | Hugo Boss | 82 | 75-89 | high | Background: Boss Bottled is a long-standing global men's bestseller and one of Coty's largest brands |
| 26 | Maison Martin Margiela (Maison Margiela) | 82 | 75-89 | high | Sourced: L'Oréal 2025 annual report credits a "blockbuster success with Replica" |
| 27 | Marc Jacobs | 82 | 75-89 | med | Background: Daisy franchise is a long-running US mass-prestige bestseller |
| 28 | Azzaro | 80 | 75-89 | med | Sourced: Spate luxury fragrance search +95% (2025); L'Oréal Luxe [adj. 78→80] |
| 29 | Burberry | 80 | 75-89 | med | Background: Burberry Her and Hero |
| 30 | Bvlgari | 80 | 75-89 | med | Background: Bvlgari Man, Omnia and the Allegra line; strong global and duty-free presence |
| 31 | Hermès | 80 | 75-89 | med | Background: Terre d'Hermès and Twilly; Hermès reports perfume and beauty as a separate business line |
| 32 | Kayali Fragrances | 80 | 75-89 | high | Sourced: 2,690 doors in 30 countries by end of 2024; called Sephora's No. 1 fragrance brand "last year" |
| 33 | Viktor&Rolf | 80 | 75-89 | med | Sourced: Spate search +58% (2025); L'Oréal Luxe portfolio, no figures |
| 34 | Parfums de Marly | 78 | 75-89 | high | Sourced: Retail sales +42% to $780M in the year to March 2026 [adj. 73→78] |
| 35 | Billie Eilish | 77 | 75-89 | high | Sourced: Parlux told WWD the line grew 30% in 2025, was the #1 fragrance SKU at Ulta and the #2 brand by units in Circana. Your Turn (2025) is positioned as a... |
| 36 | Issey Miyake | 77 | 75-89 | med | Background: L'Eau d'Issey is a legacy global bestseller, now mainly discounter-led in the US |
| 37 | Chloé | 76 | 75-89 | med | Background: Chloé EDP is a long-running women's bestseller |
| 38 | Jimmy Choo | 76 | 75-89 | high | Sourced: Interparfums' largest brand; fragrance +6% in FY2025 (group sales $1.49B) |
| 39 | Lattafa Perfumes | 76 | 75-89 | high | Sourced: Over $100M on Amazon and $63M+ on TikTok Shop in one year; Spate US popularity +105%; 120+ countries (Euromonitor, Happi) [adj. 59→76] |
| 40 | Montblanc | 76 | 75-89 | med | Sourced: One of Interparfums' core brands; FY2025 sales "broadly in line with 2024"; Explorer and Legend lines |
| 41 | Creed | 75 | 75-89 | high | Sourced: Kering bought it for €3.5bn (2023); Aventus a top seller in one retailer's order data [adj. 72→75] |
| 42 | Davidoff | 74 | 60-74 | med | Sourced: Coty FY25 cites Cool Elixir launch; Cool Water is a long-running global bestseller |
| 43 | Le Labo | 74 | 60-74 | med | Sourced: Among Estée Lauder's three fastest-growing brands (FY2026); Morning Consult ~14% recent purchase among aware [adj. 72→74] |
| 44 | Maison Francis Kurkdjian | 74 | 60-74 | med | Sourced: LVMH 2025 highlight; Morning Consult ~22% recent purchase among aware, the category high [adj. 73→74] |
| 45 | Narciso Rodriguez | 74 | 60-74 | med | Background: For Her musk franchise is a well-known prestige bestseller |
| 46 | By Kilian | 72 | 60-74 | high | Sourced: Among Estée Lauder's three fastest-growing brands (FY2026) [adj. 68→72] |
| 47 | Elizabeth Arden | 72 | 60-74 | med | Background: Red Door, 5th Avenue and Green Tea are legacy mass-prestige lines |
| 48 | Byredo | 70 | 60-74 | high | Sourced: Led Puig niche to double-digit growth FY2025; Morning Consult ~16% recent purchase among aware [adj. 68→70] |
| 49 | Coach | 70 | 60-74 | med | Sourced: Fragrance sales +15% in 2025; one of IP's larger brands |
| 50 | Estée Lauder | 70 | 60-74 | med | Background: The brand's own fragrances (Beautiful, Pleasures, Youth-Dew) have long-standing department-store reach . Corporate scale doesn't equal... [adj. 78→70] |
| 51 | Zara | 70 | 60-74 | med | Background: Very high unit volume of cheap "dupe" scents, but sold only in its own stores |
| 52 | Diptyque | 69 | 60-74 | high | Background: Global boutique network with Philosykos and Do Son |
| 53 | Phlur | 68 | 60-74 | high | Sourced: Expected >$150M retail sales in 2025, +65% YoY; rose from Sephora top-20 to top-10 fine fragrance [adj. 72→68] |
| 54 | Acqua di Parma | 66 | 60-74 | med | Background: Colonia and Blu Mediterraneo |
| 55 | Amouage | 66 | 60-74 | med | Sourced: L'Oréal took a minority stake; three scents in one retailer's top 25 |
| 56 | Cartier | 66 | 60-74 | med | Background: Declaration, Baiser Volé, Les Heures; luxury distribution |
| 57 | Glossier | 66 | 60-74 | med | Sourced: You EDP is a cult bestseller and is credited with reviving the brand. Sephora carries the You line (e.g. You Fleur). Puck (Mar 2026) reports a... |
| 58 | Moschino | 66 | 60-74 | med | Background: Toy 2 and Toy Boy are widely sold mass-prestige lines |
| 59 | Initio Parfums Prives | 65 | 60-74 | high | Sourced: Retail sales +32% to $220M (2026 figure) [adj. 62→65] |
| 60 | Louis Vuitton | 65 | 60-74 | med | Background: High-profile luxury fragrance line, but sold only in brand stores |
| 61 | Donna Karan | 64 | 60-74 | med | Sourced: Moved from Estée Lauder to Inter Parfums; DK/DKNY -4% in 2025 after the DKNY 24/7 launch base |
| 62 | Frederic Malle (merged with Frederic Malle Editions de Parfums) | 64 | 60-74 | high | Sourced: Leading luxury niche house under ELC with a global boutique network [adj. 60/68→64] |
| 63 | Lacoste Fragrances | 64 | 60-74 | high | Sourced: $108M brand sales 2025, fragrance +28% [adj. 62→64] |
| 64 | Xerjoff | 64 | 60-74 | med | Sourced: Present in more than 100 countries (Forbes Italia, June 2024); revenue not disclosed |
| 65 | Penhaligon's | 63 | 60-74 | med | Background: Heritage British niche house with a global boutique network |
| 66 | Sabrina Carpenter | 63 | 60-74 | med | Sourced: >$100M global retail sales 2025 (per Scent Beauty CEO); >$11M US sales 2025 (YipitData); only celebrity fragrance in Klarna beauty top 10, Black... |
| 67 | Kenzo | 62 | 60-74 | med | Background: Flower by Kenzo is a global designer classic; weaker in US than in Europe [adj. 66→62] |
| 68 | Kylie Cosmetics | 62 | 60-74 | med | Sourced: Coty launched Cosmic (2024), then Cosmic 2.0 (2025) and Cosmic Intense, and rolled them out in GTR |
| 69 | Loewe | 62 | 60-74 | med | Background: Luxury house fragrance with growing global presence |
| 70 | Michael Kors | 62 | 60-74 | med | Sourced: License moved from Estée Lauder to EuroItalia (2023); mid-size designer |
| 71 | Salvatore Ferragamo | 62 | 60-74 | med | Sourced: Interparfums portfolio brand; FY2025 sales down 9% |
| 72 | Tommy Hilfiger | 62 | 60-74 | med | Background: Long-running mass-designer line (Tommy, Tommy Girl), now skews to value channels |
| 73 | Armaf | 60 | 60-74 | med | Sourced: Club de Nuit Intense Man is a viral Aventus alternative; named alongside Lattafa and Afnan in TikTok Shop coverage (that source is a reseller blog).... [adj. 55→60] |
| 74 | Bond No 9 | 60 | 60-74 | med | Background: Wide US luxury department-store presence |
| 75 | Zadig & Voltaire | 60 | 60-74 | med | Sourced: This Is Her!/This Is Him! is a big European designer franchise with ongoing flankers (Burning Love, 2025) [adj. 65→60] |
| 76 | Comme Des Garcons | 58 | 40-59 | med | Background: Cult niche line with Wonderwood and the Series range |
| 77 | Serge Lutens | 58 | 40-59 | med | Background: Influential niche house, but US retail presence has shrunk |
| 78 | Van Cleef & Arpels | 58 | 40-59 | med | Sourced: Interparfums portfolio brand, no 2025 figures disclosed |
| 79 | Miu Miu | 57 | 40-59 | med | Background: Designer licence with smaller reach than Prada; the line was relaunched after the L'Oréal licence change |
| 80 | Afnan | 56 | 40-59 | med | Sourced: 9pm went viral; named among the TikTok Shop leaders [adj. 52→56] |
| 81 | Abercrombie & Fitch | 55 | 40-59 | med | Background: Fierce is a long-running mass bestseller; brand-store distribution, not Sephora/Ulta |
| 82 | Aesop | 55 | 40-59 | med | Sourced: L'Oreal bought Aesop from Natura for $2.5B; fragrance is one category within a skincare-led brand [adj. 60→55] |
| 83 | Celine | 55 | 40-59 | med | Background: Luxury haute-parfumerie line with no Sephora/department-store breadth |
| 84 | Fendi | 55 | 40-59 | low | Background: Mega fashion house, but fragrance is a smaller line than Dior/Givenchy within LVMH; relaunched as a luxury collection [adj. 60→55] |
| 85 | Nest (New York) | 55 | 40-59 | med | Sourced: US sales nearing $200M (2023); ~40% share of prestige home fragrance; Ulta fine fragrance projected >$35M year one [adj. 60→55] |
| 86 | Rihanna | 55 | 40-59 | med | Sourced: Fenty EDP sold out in under 24h at its 2021 launch and later became a permanent Sephora item [adj. 60→55] |
| 87 | Roja Dove (trades as Roja Parfums) | 55 | 40-59 | med | Background: Ultra-luxury niche with limited but high-end doors |
| 88 | Lanvin | 54 | 40-59 | low | Background: Éclat d'Arpège; not mentioned in IP FY25 release |
| 89 | Rare Beauty | 54 | 40-59 | med | Sourced: Megabrand in makeup; first fragrance Rare Eau de Parfum launched Aug 2025, second (Rare Beginnings) followed. Fragrance line itself is young, no... |
| 90 | Britney Spears | 52 | 40-59 | med | Sourced: Curious sold ~$100M in its first year; franchise $300M by 2006 (historic); still a widely stocked mass celebrity line [adj. 58→52] |
| 91 | Clean | 52 | 40-59 | low | Background: Long-time Sephora clean-fragrance staple |
| 92 | Ellis Brooklyn | 52 | 40-59 | high | Sourced: Reported $30-40M 2024 sales; Sephora + Ulta + Nordstrom |
| 93 | L'Occitane en Provence | 52 | 40-59 | med | Sourced: 48.4% of €2.8bn group sales FY25, but mostly skincare/body; fragrance share unknown [adj. 60→52] |
| 94 | Montale | 52 | 40-59 | med | Background:  |
| 95 | Rochas | 52 | 40-59 | low | Background: Eau de Rochas, Girl; not mentioned in IP FY25 release |
| 96 | Adidas | 50 | 40-59 | med | Sourced: Coty FY25 names adidas a key mass fragrance brand (Vibes launch) |
| 97 | Ajmal | 50 | 40-59 | med | Sourced: 350+ showrooms, 60+ countries, 80+ duty-free points (Jan 2026) |
| 98 | Al Haramain Perfumes | 50 | 40-59 | med | Background: Amber Oud line; one of the largest traditional Gulf houses |
| 99 | Aquolina | 50 | 40-59 | med | Background: Pink Sugar is a perennial mass-gourmand bestseller |
| 100 | Arabian Oud | 50 | 40-59 | low | Background: Large Saudi chain with hundreds of stores in the Gulf and abroad ; no source fetched this session |
| 101 | Bottega Veneta | 50 | 40-59 | low | Background: The older Coty-era line was largely discontinued, and a luxury relaunch has narrow distribution |
| 102 | Fine Ry | 50 | 40-59 | med | Sourced: Fine'ry (Target): The New Rouge was Circana's top US mass fragrance launch of 2024 (via GCI) [adj. 15→50] |
| 103 | Juicy Couture | 50 | 40-59 | low | Background: Viva La Juicy legacy bestseller |
| 104 | Juliette Has A Gun | 50 | 40-59 | med | Sourced: Not a Perfume is a cult hit; sold across Sephora Middle East |
| 105 | Mancera | 50 | 40-59 | med | Background: Sister to Montale with similar reach |
| 106 | Nautica | 50 | 40-59 | med | Background: Nautica Voyage is a high-volume budget men's staple |
| 107 | Nina Ricci | 50 | 40-59 | low | Background: Nina / La Tentation line; Puig heritage brand [adj. 55→50] |
| 108 | Nishane | 50 | 40-59 | med | Background:  |
| 109 | Clive Christian | 48 | 40-59 | low | Background: Ultra-luxury, low volume |
| 110 | Elie Saab | 48 | 40-59 | low | Background: Le Parfum; Puig license |
| 111 | Fragrance World | 48 | 40-59 | med | Sourced: Says it is in more than 150 countries and makes "hundreds of thousands" of fragrances daily (Jan 2026) |
| 112 | Jennifer Lopez | 48 | 40-59 | med | Sourced: Fragrance line reached nearly $2B across 18 scents to 2015 (WWD via Scento); past its peak [adj. 52→48] |
| 113 | Lush | 48 | 40-59 | med | Background: Broad own-store footprint; fragrance (Gorilla Perfume) is a small part of the business [adj. 55→48] |
| 114 | Marc-Antoine Barrois | 48 | 40-59 | med | Background: Ganymede is a viral niche hit, and the brand has outsized buzz for its size |
| 115 | Memo Paris | 48 | 40-59 | low | Background: Niche house with luxury department-store distribution ; ownership not verified |
| 116 | Paris Hilton | 48 | 40-59 | med | Sourced: Parlux claims >$2B global sales across 30+ fragrances since 2004 [adj. 50→48] |
| 117 | Roberto Cavalli | 48 | 40-59 | med | Sourced: Fragrance sales +33% in 2025 (second full year at IP) |
| 118 | Ex Nihilo | 46 | 40-59 | med | Sourced: PE-backed Paris niche house with a luxury department-store presence |
| 119 | Rasasi | 46 | 40-59 | med | Sourced: Euromonitor names it as an Arabian-origin house in its GCC category sizing, without brand figures |
| 120 | Snif | 46 | 40-59 | high | Sourced: Brand expects ~$40M sales with triple-digit growth |
| 121 | Aramis | 45 | 40-59 | low | Background: Heritage men's brand; ADF division was wound down (BOF) |
| 122 | Beyoncé | 45 | 40-59 | med | Sourced: Heat sold more than $400M (2010-13, Billboard via Scento). Cé Noir launched in 2023 at a high price point, with no sales figures found [adj. 48→45] |
| 123 | Bon Parfumeur | 45 | 40-59 | med | Background: French affordable-niche brand stocked at Sephora |
| 124 | David Beckham | 45 | 40-59 | low | Background: Mass celebrity men's line; not named in Coty FY25 release |
| 125 | Dedcool | 45 | 40-59 | med | Sourced: Sephora carries the line (e.g. Sunlit Blooms), and Glossy covers it in Sephora's clean-fragrance push |
| 126 | Escentric Molecules | 45 | 40-59 | low | Background: Molecule 01 cult bestseller |
| 127 | Guy Laroche | 45 | 40-59 | med | Background: Drakkar Noir remains a widely distributed mass classic |
| 128 | Hollister | 45 | 40-59 | med | Background: Teen mall brand; colognes/body mists sold in-store |
| 129 | L'Artisan Parfumeur | 45 | 40-59 | med | Background: Historic niche house; low US visibility |
| 130 | Maison Alhambra | 45 | 40-59 | med | Sourced: Low-price dupe line under Lattafa |
| 131 | Oakcha | 45 | 40-59 | high | Sourced: TikTok Shop sales up 125%+ YoY to $6.2M in H1 2025 (Charm.io); Ulta rollout |
| 132 | Pacifica | 45 | 40-59 | med | Background: Mass "clean" beauty brand whose roll-on and spray perfumes sit in mass retail |
| 133 | Swiss Arabian | 45 | 40-59 | med | Sourced: Gulf store chain; Walmart US listings exist |
| 134 | BDK Parfums | 44 | 40-59 | high | Sourced: About $25M wholesale; 2025 up 45%; 200+ doors in 45 countries |
| 135 | Cacharel | 44 | 40-59 | low | Background: Amor Amor, Yes I Am [adj. 50→44] |
| 136 | Chopard | 44 | 40-59 | low | Background: Oud Malaki, Wish |
| 137 | Dries Van Noten | 44 | 40-59 | med | Sourced: Puig fashion house with beauty line; Puig opened new London store and renovated Tokyo in 2025. No brand-level fragrance sales disclosed |
| 138 | French Avenue | 44 | 40-59 | med | Background: Parent says it sells in 150+ countries and exported 60M+ units last year. Viral dupes |
| 139 | Kate Spade | 44 | 40-59 | low | Background: Not mentioned in IP FY25 release |
| 140 | Tory Burch | 44 | 40-59 | low | Background: Licensee not confirmed for 2025 |
| 141 | Antonio Banderas | 42 | 40-59 | med | Background: Blue Seduction and The Golden Secret are big-volume mass sellers outside the US [adj. 50→42] |
| 142 | Boadicea the Victorious | 42 | 40-59 | low | Sourced: Harrods "sensory sanctuary"; mostly UK and Gulf luxury doors |
| 143 | BORNTOSTANDOUT® | 42 | 40-59 | high | Sourced: About $10M expected 2026 revenue; 65 countries |
| 144 | Floral Street | 42 | 40-59 | med | Sourced: Clean-fragrance brand with a Sephora listing |
| 145 | Lalique | 42 | 40-59 | low | Background: Long-running fragrance line (Encre Noire) with discount-channel distribution |
| 146 | Natura | 42 | 40-59 | med | Sourced: Large LatAm beauty company with net income of nearly R$1B after restructuring (Mar 2026); US reach small [adj. 58→42] |
| 147 | O Boticario | 42 | 40-59 | med | Background: Major Brazilian fragrance franchise (Malbec, Lily); regional [adj. 58→42] |
| 148 | Origins | 42 | 40-59 | med | Sourced: Mainly skincare; fragrance = Ginger Essence franchise in dept stores |
| 149 | Rituals | 42 | 40-59 | med | Sourced: EUR 2.1bn revenue 2024 (+21%), targeting >EUR 2.4bn 2025; fragrance is only part of the mix (share not disclosed) [adj. 55→42] |
| 150 | Vilhelm Parfumerie | 42 | 40-59 | low | Background: Niche house with luxury department-store doors ; no source fetched |
| 151 | Arabiyat Prestige | 40 | 40-59 | med | Sourced: Six scents went popular globally in 2025, and Marwa was expected to reach about 1M units by December. The group reports 50% YoY growth. Source is... |
| 152 | Boy Smells | 40 | 40-59 | med | Sourced: Sephora since 2022; brand says it "struggled the last four years," then had its best sales week in four years after the 2025 rebrand |
| 153 | Caron | 40 | 40-59 | low | Background: Heritage house (Pour un Homme), relaunched upmarket; modest US reach |
| 154 | DS&Durga | 40 | 40-59 | low | Background: Brooklyn niche |
| 155 | Etat Libre d'Orange | 40 | 40-59 | low | Background: Cult niche; Nordstrom and Neiman presence not confirmed |
| 156 | Goldfield & Banks Australia | 40 | 40-59 | low | Sourced: Brand site lists international boutiques; no named major US chain |
| 157 | My Perfumes (merged with Mpf) | 40 | 40-59 | low | Sourced: Growing UAE affordable house (Arabiyat, Otoori lines); viral "Arabiyat Sugar" 2025; no revenue found [adj. 40/20→40] |
| 158 | Oscar de la Renta | 40 | 40-59 | low | Background: Not mentioned in IP FY25 release |
| 159 | Perry Ellis | 40 | 40-59 | low | Background: 360 line is a long-selling mass/discount staple |
| 160 | Skylar | 40 | 40-59 | low | Sourced: Clean/hypoallergenic DTC brand with an allergen-free collection |
| 161 | The Body Shop | 40 | 40-59 | med | Background: Rescued from administration; US stores closed, returned digitally [adj. 50→40] |
| 162 | Bentley | 38 | 20-39 | low | Background: Car-brand fragrance line sold mostly through value channels |
| 163 | Emper | 38 | 20-39 | low | Sourced: advertiser content in Gulf News claims distribution to 120 countries. The claim isn't independent |
| 164 | Histoires de Parfums | 38 | 20-39 | low | Background: Established niche house with wide specialist distribution |
| 165 | Jil Sander | 38 | 20-39 | low | Background: Sun is a cult classic, but the line has a weak US prestige presence [adj. 45→38] |
| 166 | Joop! | 38 | 20-39 | med | Background: Joop! Homme is a long-running European mass bestseller [adj. 45→38] |
| 167 | Lolita Lempicka | 38 | 20-39 | low | Sourced: Active French designer line with 2025 launches (Fleurs, Le Parfum flacon minuit); sold at Sephora.fr [adj. 45→38] |
| 168 | Maison Louis Marie | 38 | 20-39 | low | Background: Affordable perfume oils with gift-retail presence |
| 169 | Missoni | 38 | 20-39 | low | Background: Legacy designer line with low current US prestige presence |
| 170 | Nasomatto | 38 | 20-39 | low | Background: Cult niche house (Black Afgano); small range, no own boutiques |
| 171 | Revlon | 38 | 20-39 | med | Sourced: Legacy Charlie franchise still sold in mass channels; minor fragrance business vs Revlon cosmetics |
| 172 | Stéphane Humbert Lucas 777 | 38 | 20-39 | low | Background: Ultra-luxury niche with strong Gulf demand |
| 173 | The 7 Virtues | 38 | 20-39 | med | Sourced: Clean fragrance at Sephora; viral gourmand launches (Buttercream Haze) |
| 174 | Vera Wang | 38 | 20-39 | med | Sourced: Coty FY25 names Vera Wang a key mass fragrance brand |
| 175 | Yves Rocher | 38 | 20-39 | low | Background: Large French mass beauty brand, strongest in Europe and Russia; fragrance is a secondary line [adj. 50→38] |
| 176 | Jaguar | 36 | 20-39 | low | Sourced: Absent from IP FY25 brand list; status unclear |
| 177 | Paris Corner | 36 | 20-39 | low | Sourced: $25-80 dupe line; no scale data found |
| 178 | Tiziana Terenzi | 36 | 20-39 | low | Background: Italian niche house (Kirke) ; no sales data found |
| 179 | Ahmed Al Maghribi | 35 | 20-39 | med | Sourced: Established UAE house expanding to Europe (e.g. Ireland) |
| 180 | Henry Rose | 35 | 20-39 | med | Sourced: Celebrity-founded clean fragrance at Sephora |
| 181 | RAVE | 35 | 20-39 | med | Sourced: Lattafa's Rave line (Rave Now etc.) rides Lattafa's distribution |
| 182 | Rayhaan | 35 | 20-39 | low | Sourced: Budget Middle-Eastern brand with Walmart US listings |
| 183 | 4711 | 34 | 20-39 | med | Sourced: M&W revenue ~EUR 150M in 2020, targeting >EUR 300M in 2026; claims #1 ahead of Coty in German drugstores (company-level, not 4711 alone) [adj. 46→34] |
| 184 | Abdul Samad Al Qurashi | 34 | 20-39 | low | Background: Major regional luxury oud house; weak US retail [adj. 40→34] |
| 185 | Carner Barcelona | 34 | 20-39 | low | Background: Spanish niche |
| 186 | Imaginary Authors | 34 | 20-39 | low | Background: Indie US niche |
| 187 | Khadlaj Perfumes | 34 | 20-39 | low | Background: Budget Gulf brand sold mostly online in the US |
| 188 | Maison Crivelli | 34 | 20-39 | low | Background: Fast-rising French niche |
| 189 | Ormonde Jayne | 34 | 20-39 | low | Background: British niche |
| 190 | Shakira | 34 | 20-39 | low | Background: Minor US celebrity line; strong in LatAm [adj. 40→34] |
| 191 | Floraïku | 33 | 20-39 | low | Background: Small luxury niche brand |
| 192 | Papillon Artisan Perfumes | 33 | 20-39 | low | Background: Critically respected indie with small output |
| 193 | Profumum Roma | 33 | 20-39 | low | Background: Italian niche |
| 194 | Valmont | 33 | 20-39 | med | Sourced: Luxury skincare house; Storie Veneziane fragrances since 2018 |
| 195 | Ard Al Zaafaran | 32 | 20-39 | low | Background: Affordable Arabian line popular online (Dirham etc.) |
| 196 | By Rosie Jane | 32 | 20-39 | med | Sourced: Clean fragrance brand expanded to Sephora abroad |
| 197 | Demeter Fragrance | 32 | 20-39 | low | Background: Single-note novelty colognes; no 2025 retail evidence found |
| 198 | Essential Parfums | 32 | 20-39 | low | Background: Affordable "perfumer-led" niche brand; limited US presence |
| 199 | Gissah | 32 | 20-39 | low | Background: Gulf luxury house with little US presence |
| 200 | Korres | 32 | 20-39 | med | Sourced: Natural skincare brand; small EDT line |
| 201 | Mercedes-Benz | 32 | 20-39 | low | Background: Licensed men's line sold mainly through discount channels |
| 202 | Oribe | 32 | 20-39 | med | Sourced: Prestige haircare; Côte d'Azur signature EDP |
| 203 | Orto Parisi | 32 | 20-39 | low | Background: Sister line to Nasomatto; specialist-only |
| 204 | Reef Perfumes | 32 | 20-39 | low | Sourced: Regional retail chain brand |
| 205 | Thomas Kosmala | 32 | 20-39 | low | Background: No. 4 Après l'Amour is a known niche hit |
| 206 | ZARKOPERFUME | 32 | 20-39 | med | Sourced: Molécule 234.38 is its known hero product, with listings across niche e-tailers |
| 207 | Zimaya | 32 | 20-39 | low | Background: Budget Afnan line ; no sales data found |
| 208 | Alfred Dunhill | 30 | 20-39 | med | Sourced: IP license phased out Aug 2024; current status unclear |
| 209 | ALREHAB PERFUMES | 30 | 20-39 | low | Background: Cheap attar roll-ons, widely sold online |
| 210 | Asgharali | 30 | 20-39 | low | Background: Heritage attar/oud house with little Western retail |
| 211 | Astier De Villatte | 30 | 20-39 | med | Sourced: Ceramics/candle house with cologne line; specialist distribution |
| 212 | Atelier des Ors | 30 | 20-39 | low | Background: Small luxury niche with specialist distribution |
| 213 | Avon | 30 | 20-39 | low | Background: Historically huge, but the US business is shrinking; US fragrance relevance is now low |
| 214 | Bharara | 30 | 20-39 | med | Sourced: Distribution visible mainly through discount e-tailers; Bharara King is the hero |
| 215 | Casamorati 1888 | 30 | 20-39 | low | Background: Xerjoff sub-line; riding Xerjoff's reach |
| 216 | Commodity | 30 | 20-39 | med | Sourced: Shut down April 2019, bought by Europerfumes Aug 2019, back at Sephora 2022 |
| 217 | Ella K Parfums | 30 | 20-39 | low | Background: Young luxury niche house |
| 218 | Ferrari | 30 | 20-39 | low | Background: Scuderia Ferrari line, discounter brand |
| 219 | Fragancias Cannon | 30 | 20-39 | low | Sourced: Described as the leading perfume manufacturer in Argentina (article page body not retrievable) |
| 220 | Granado | 30 | 20-39 | med | Sourced: Puig took a 35% stake in the Brazilian heritage pharmacy group [adj. 42→30] |
| 221 | Halloween | 30 | 20-39 | med | Sourced: Long-running Spanish mass franchise with many flankers [adj. 35→30] |
| 222 | Hamidi | 30 | 20-39 | low | Background: Affordable Arabian |
| 223 | Haute Fragrance Company HFC | 30 | 20-39 | low | Sourced: Luxury-niche positioning with thin evidence |
| 224 | Jeanne Arthes | 30 | 20-39 | low | Background: Budget French mass line |
| 225 | Jovoy Paris | 30 | 20-39 | low | Background: Better known as a niche boutique than as a house |
| 226 | Lorenzo Pazzaglia | 30 | 20-39 | low | Background: Italian influencer niche |
| 227 | M. Micallef | 30 | 20-39 | low | Background: French niche |
| 228 | Maison Asrar | 30 | 20-39 | low | Sourced: Budget Middle Eastern house riding the Lattafa-style wave |
| 229 | Matiere Premiere | 30 | 20-39 | low | Background: French niche |
| 230 | Mind Games | 30 | 20-39 | low | Sourced: Glossy (Apr 2026) reports double-digit sales growth with no hero fragrance; no figures |
| 231 | Oriflame | 30 | 20-39 | low | Background: Direct-selling beauty brand with a large fragrance share; declining revenue and no US retail [adj. 45→30] |
| 232 | Paloma Picasso | 30 | 20-39 | low | Background: Heritage 1984 classic with a legacy-only presence |
| 233 | Parfum d'Empire | 30 | 20-39 | low | Background: Respected artisan indie |
| 234 | Pierre Guillaume Paris | 30 | 20-39 | low | Background: Respected small niche brand |
| 235 | Puma | 30 | 20-39 | low | Background: Low-price sports licence fragrances |
| 236 | Sospiro Perfumes | 30 | 20-39 | low | Background: Italian luxury niche; specialist-store only |
| 237 | Tauer Perfumes | 30 | 20-39 | low | Background: Respected artisan indie |
| 238 | The Dua Brand | 30 | 20-39 | low | Sourced: DTC dupe house advertising 2,400+ designer dupes; no sales data found |
| 239 | The Merchant of Venice | 30 | 20-39 | low | Background: Italian heritage-themed line with low US presence |
| 240 | Tru Western | 30 | 20-39 | med | Sourced: Western-lifestyle mass line; Yellowstone/Wrangler licenses |
| 241 | Trussardi | 30 | 20-39 | low | Background: Regional designer [adj. 38→30] |
| 242 | Yardley | 30 | 20-39 | low | Background: Heritage mass brand, weak in US [adj. 42→30] |
| 243 | Aromatix X French Avenue | 28 | 20-39 | low | Sourced: 2025 collab line (Frostbite, Platine Blanc) under fast-growing French Avenue |
| 244 | Benetton | 28 | 20-39 | low | Background: Colors line [adj. 34→28] |
| 245 | Coty | 28 | 20-39 | low | Sourced: Parent is huge, but Coty-branded scents (Wild Musk, Exclamation) are minor drugstore lines; see notes |
| 246 | Etro | 28 | 20-39 | low | Background: Italian fashion-niche fragrances |
| 247 | Fragonard | 28 | 20-39 | low | Background: Large tourist-driven French retail footprint, small US presence [adj. 38→28] |
| 248 | Gisada | 28 | 20-39 | med | Sourced: Founded 2013; 370 German stores (2018), 200 French (2019); 150-200 staff [adj. 38→28] |
| 249 | Gulf Orchid | 28 | 20-39 | low | Background: Budget Gulf brand, online-only in the US |
| 250 | Halston | 28 | 20-39 | low | Background: Legacy designer name; discount channel |
| 251 | Heretic Parfum | 28 | 20-39 | low | Background: Small clean-niche brand |
| 252 | Katy Perry | 28 | 20-39 | low | Sourced: Sourced only as a historical Coty licensee. No current sales data found |
| 253 | La Rive | 28 | 20-39 | low | Background: Ultra-cheap dupe brand |
| 254 | Les Liquides Imaginaires | 28 | 20-39 | low | Background: Small artistic niche house |
| 255 | Lore | 28 | 20-39 | med | Sourced: Sephora-stocked indie (Sublimity, Somewhere But Nowhere); press in Marie Claire/Essence |
| 256 | Nabeel | 28 | 20-39 | low | Background: Affordable Arabian, small US footprint |
| 257 | Playboy | 28 | 20-39 | low | Background: Minor drugstore celebrity/brand line |
| 258 | Room 1015 | 28 | 20-39 | med | Sourced: Rock-themed niche brand with multiple niche-retail listings |
| 259 | Rosendo Mateu Olfactive Expressions | 28 | 20-39 | low | Sourced: Spanish niche from perfumer Rosendo Mateu |
| 260 | The Different Company | 28 | 20-39 | low | Background: French niche |
| 261 | Ulric de Varens | 28 | 20-39 | low | Sourced: Budget French mass house |
| 262 | Police | 26 | 20-39 | low | Background: Low US presence [adj. 32→26] |
| 263 | Akro | 25 | 20-39 | low | Background: Small niche |
| 264 | Al Wataniah | 25 | 20-39 | low | Background: Budget Arabian line sold online |
| 265 | Dumont | 25 | 20-39 | low | Background: Affordable "Nitro" line popular online |
| 266 | Fragrance Du Bois | 25 | 20-39 | low | Background: Luxury oud niche, small footprint |
| 267 | Gloria Vanderbilt | 25 | 20-39 | low | Background: Low-price legacy drugstore line |
| 268 | Henry Jacques | 25 | 20-39 | low | Background: Ultra-luxury, very limited availability; high price, low reach |
| 269 | Houbigant | 25 | 20-39 | low | Background: Historic house, small revival (Quelques Fleurs, Fougère Royale) |
| 270 | Jean Patou | 25 | 20-39 | low | Background: Joy/1000 legacy; fragrance ownership needs a check |
| 271 | Jequiti | 25 | 20-39 | low | Background: Big Brazilian direct-selling cosmetics brand; essentially no US presence [adj. 40→25] |
| 272 | Les Indémodables | 25 | 20-39 | low | Background: Online "inspired-by" style house |
| 273 | Louis Cardin | 25 | 20-39 | low | Background: Affordable Arabian brand, online-led in US |
| 274 | Masque Milano | 25 | 20-39 | low | Background: Small artistic niche house |
| 275 | Milton Lloyd | 25 | 20-39 | low | Background: Budget dupe brand |
| 276 | Molinard | 25 | 20-39 | low | Background: Heritage Grasse house |
| 277 | Nike | 25 | 20-39 | low | Background: Low-price licensed body sprays; not a Nike core business |
| 278 | Nobile 1942 | 25 | 20-39 | low | Background: Italian niche, specialist-only |
| 279 | Otoori | 25 | 20-39 | low | Sourced: Customisable/layering series inside My Perfumes |
| 280 | Parfums Berdoues | 25 | 20-39 | low | Sourced: Historic French house (1902 collection) |
| 281 | Riiffs Perfumes | 25 | 20-39 | med | Sourced: Seen mainly through Perfume.com, Faire and Debenhams AU listings |
| 282 | Régime des Fleurs | 25 | 20-39 | low | Background: Small niche brand whose doors shrank after Barneys closed |
| 283 | Str8 | 25 | 20-39 | med | Sourced: Sarantis' flagship male fragrance; Giannis Antetokounmpo global ambassador [adj. 38→25] |
| 284 | WIDIAN | 25 | 20-39 | low | Background: Niche-priced Arabian line |
| 285 | Amouroud | 24 | 20-39 | low | Background: Small oud-focused niche line; parent and distribution unverified |
| 286 | Emanuel Ungaro | 24 | 20-39 | low | Background: Mainly discounter presence |
| 287 | L Erbolario | 24 | 20-39 | low | Sourced: Herbal cosmetics with fragrance lines; 2023 sales growth ~28% (absolute revenue not found) [adj. 32→24] |
| 288 | Mexx | 24 | 20-39 | low | Background: Mass European licence, low US relevance [adj. 30→24] |
| 289 | Zoologist Perfumes | 24 | 20-39 | med | Background: Indie niche brand with a strong enthusiast following |
| 290 | Adopt Parfums | 22 | 20-39 | low | Background: Affordable French high-street perfume chain [adj. 35→22] |
| 291 | Alexandria Fragrances | 22 | 20-39 | low | Background: Online clone/inspired-by house |
| 292 | Animale | 22 | 20-39 | low | Sourced: 1987-era brand still sold at discount |
| 293 | Bruno Banani | 22 | 20-39 | low | Background: German mass licence [adj. 30→22] |
| 294 | Fugazzi | 22 | 20-39 | low | Background: Small online indie |
| 295 | Giardini di Toscana | 22 | 20-39 | low | Background: Small niche brand |
| 296 | Hiram Green | 22 | 20-39 | low | Background: All-natural micro-niche |
| 297 | Jo Milano Paris | 22 | 20-39 | low | Sourced: Dupe-style line (Dubai King/Queen) |
| 298 | Kerosene | 22 | 20-39 | low | Background: Indie online house |
| 299 | Maison Mataha | 22 | 20-39 | low | Sourced: "Viral gourmand" niche per retailer |
| 300 | Nikos | 22 | 20-39 | low | Background: Sculpture line found mainly at discounters |
| 301 | Omanluxury | 22 | 20-39 | low | Sourced: Omani niche, decent online retail spread |
| 302 | Slumberhouse | 22 | 20-39 | med | Sourced: Stocked at Luckyscent; still discussed on Basenotes; cult indie |
| 303 | So...? | 22 | 20-39 | med | Sourced: UK drugstore body-mist brand with broad Boots/Superdrug range; no US presence [adj. 33→22] |
| 304 | Solinotes | 22 | 20-39 | low | Sourced: Affordable French soliflore line |
| 305 | Superz | 22 | 20-39 | low | Sourced: Founded 2021; self-described "Hungary's most beloved perfume brand" |
| 306 | Ted Lapidus | 22 | 20-39 | low | Background: Legacy designer; Pour Homme sold via discounters |
| 307 | Al Jazeera Perfumes | 20 | 20-39 | low | Background: Regional brand; little US presence |
| 308 | Areej Le Dore | 20 | 20-39 | low | Background: Cult indie with sell-out drops; tiny volume |
| 309 | Atralia | 20 | 20-39 | low | Sourced: Middle-Eastern-style budget line in US discounters |
| 310 | Hormone Paris | 20 | 20-39 | low | Sourced: Pheromone-themed niche |
| 311 | Naomi Campbell | 20 | 20-39 | low | Background: Minor celebrity line |
| 312 | Sultan Pasha Perfumes | 20 | 20-39 | low | Sourced: Artisan attar perfumer; critic coverage (Luca Turin) |
| 313 | Worth | 20 | 20-39 | low | Background: Je Reviens heritage name with minimal current presence |
| 314 | 4160 Tuesdays | 18 | 0-19 | low | Sourced: UK indie (Sarah McCartney) |
| 315 | Andrea Maack | 18 | 0-19 | low | Background: Small art-led niche house |
| 316 | Borsari | 18 | 0-19 | low | Sourced: Historic Violetta di Parma house |
| 317 | Ensar Oud | 18 | 0-19 | low | Background: Artisan oud oils, collector-niche |
| 318 | Filippo Sorcinelli | 18 | 0-19 | low | Background: Micro artistic house |
| 319 | Hilde Soliani | 18 | 0-19 | low | Sourced: Small Italian artisan niche |
| 320 | Michael Malul London | 18 | 0-19 | low | Sourced: Small London niche |
| 321 | Naseem | 18 | 0-19 | low | Sourced: Regional only, with no US evidence |
| 322 | Risala | 18 | 0-19 | low | Sourced: Thin evidence |
| 323 | Sora Dora | 18 | 0-19 | low | Sourced: Small niche, specialist-only |
| 324 | Toskovat | 18 | 0-19 | med | Sourced: Cult micro-niche; covered by Vogue PH and Luca Turin |
| 325 | Argos | 17 | 0-19 | low | Sourced: Small US niche |
| 326 | Anfar London | 15 | 0-19 | low | Background: Small UK Arabian-style house |
| 327 | Black Phoenix Alchemy Lab | 15 | 0-19 | low | Background: Long-running indie perfume-oil maker |
| 328 | Bortnikoff | 15 | 0-19 | low | Background: Artisanal oud micro brand |
| 329 | Mith | 15 | 0-19 | low | Sourced: Very small niche; origin unclear (Italian or Bangkok per stockist page) |
| 330 | Odette Parfum Co | 15 | 0-19 | low | Sourced: Small indie |
| 331 | Oethers | 15 | 0-19 | low | Sourced: Experience-led fragrance brand covered by design press |
| 332 | Pearfat Parfum | 15 | 0-19 | low | Background: No credible retail evidence found |
| 333 | Poesie | 15 | 0-19 | low | Background: Micro indie perfume-oil maker |
| 334 | Spongebob Squarepants | 15 | 0-19 | low | Sourced: Kids licensed EDT; brief viral resale moment |
| 335 | Dsh Perfumes | 14 | 0-19 | med | Background: Micro indie perfumer |
| 336 | Ainash Parfums | 12 | 0-19 | low | Sourced: Discount/online-only presence |
| 337 | Bujairami | 12 | 0-19 | low | Background: Couldn't confirm the brand's identity or distribution |
| 338 | Cirque Du Soleil | 12 | 0-19 | low | Sourced: First licensed fragrance debuted 2024; single SKU |
| 339 | Indult | 12 | 0-19 | low | Background: Very small output, possibly dormant |
| 340 | Jaddid | 12 | 0-19 | low | Sourced: Gulf brand with thin footprint |
| 341 | Pineward Perfumes | 12 | 0-19 | low | Background: Micro indie |
| 342 | Solstice Scents | 12 | 0-19 | low | Background: Micro indie oils |
| 343 | Sorce | 12 | 0-19 | high | Sourced: Artisan small-batch brand, founded 2022, renamed 2024 |
| 344 | Alkemia Perfumes | 10 | 0-19 | med | Background: Micro indie perfume-oil maker |
| 345 | D Annam | 10 | 0-19 | low | Background: Couldn't identify the brand |
| 346 | RDZ Parfums | 10 | 0-19 | low | Sourced: Micro indie |
| 347 | Sucreabeille | 10 | 0-19 | low | Background: Micro indie |
| 348 | Marchesa | 8 | 0-19 | low | Sourced: 2012 launch (Parfum d'Extase); no current activity found, likely discontinued |

## Conclusion

The house score is most useful as a correction for what FragranceNet can't see, more than as a popularity signal in its own right. FragranceNet's two signals measure discount-channel stock and reviews well, but they're structurally blind to houses that sell direct or exclusively: Bath & Body Works, Victoria's Secret, Kayali, Sol de Janeiro and MFK. They also flatter houses whose clones flood discounters. So the payoff from this table is concentrated in those two places, which is why the recommended weight is low by default and higher where data is missing.

The current table can also improve itself. Its weakest band (20-39, mostly background judgment) is where Spritz's own `fragrancenet_offers` and future in-app engagement will add the most, and its few strong anchors make a good fixed frame for log-scaled search volume later. A cheap next step: take Google Trends or keyword volume for "<house> perfume", chain it against Dior as the common anchor, and use that to re-score the 98 background-only rows in 20-39. That would replace most of the guesswork in the table with one consistent, citable signal.
