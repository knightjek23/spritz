# Popularity v2 runbook

Approved 2026-11-12. Builds `fragrances.popularity_rank_v2`.

LIVE since 2026-11-14 (migration 0046): v2 is copied into `popularity_rank`,
the column the app reads; the old AI ranking is kept in `popularity_rank_v1`.
Re-rank and promote in one step: `pnpm rank:popularity-v2 --write --promote`.
`scripts/rank-popularity.sql` is retired and refuses to run. Undo: see the
header of 0046.

Score (original, superseded below): 50% FragranceNet position, 25% reviews, 25% AI. No
FragranceNet signal -> AI percentile alone. Tier A sales-verified -> top.

Revised 2026-11-14 (Josh): weights are now 25% position / 25% reviews / 50% AI,
and house popularity (data/house-popularity.json, from the deep research in
data/house-popularity-report.md) takes 10% of every row's final score. Rows
FragranceNet doesn't sell get imputed position and review percentiles (median
of the 50 sold rows nearest them by AI percentile) and go through the same
formula. Position and reviews are percentiles within price tier, filled from
median price per ml when fragrances.price_tier is empty (budget <$0.40/ml,
mid <$1.00, designer <$2.50, niche above). The dry run prints house coverage and a benchmark table;
check both before --write. Variant down-rank (14 Nov): vintage, limited/special,
collector and anniversary editions x0.85, body/hair formats (body mist, all-over
spray, hair perfume) x0.80, tier A exempt; see variantKind() for the exact
patterns, and the dry run's "variant down-ranks" list. Re-score houses twice a year. Write sales claims
before ranking.

## Order

1. `supabase db push` (repo root) for `0045_popularity_signals.sql`.
2. Finish the product-page fetch so path matching has full coverage:
   `pnpm scrape:fragrancenet` (resumes from cache).
3. Pilot the listing crawl, then the full one (~60 min, resumable):
   `pnpm scrape:fragrancenet-bestsellers --pages=5`
   `pnpm scrape:fragrancenet-bestsellers`
4. Check the dry report (coverage, matched by path/sku, top 25, catalog gaps),
   then write the snapshot (refuses below 98% coverage):
   `pnpm scrape:fragrancenet-bestsellers --no-fetch --write --snapshot=YYYY-MM-DD`
5. Sales claims (edit `data/sales-claims.json` fragrance_id to pin ambiguous rows):
   `pnpm import:sales-claims` then `pnpm import:sales-claims --write`
6. Rank: `pnpm rank:popularity-v2` (dry, top 100 old vs new + movers), then
   `pnpm rank:popularity-v2 --write --promote`.

Re-run steps 3, 4 and 6 to refresh (the listing reshuffles daily; each crawl
is a dated snapshot). Re-check sales tiers each Jan-Feb after annual results.

Tests: `node src/popularity-v2.test.mjs`
