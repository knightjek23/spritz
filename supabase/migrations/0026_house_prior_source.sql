-- 0026_house_prior_source.sql
--
-- Adds 'house_prior' to concentration_source.
--
-- After the 0025 set-model repair, concentration was still only ~27% covered:
-- 404 rows where the fragrance name states the strength, ~2,700 matched to a
-- real retailer SKU, and 8,565 blank. The blanks are fragrances no retailer
-- in our affiliate feeds sells, which is most of the niche and
-- Middle-Eastern long tail.
--
-- A per-fragrance guess is not an option -- that was infer-concentration.ts,
-- and it was wrong ~93% of the time (see 0024). But a per-HOUSE inference is
-- a different and much safer claim. Measured across the catalog, 60 houses
-- release >=90% a single strength across 5 or more known releases:
--
--   amouage    11 known, 100% edp
--   afnan      44 known,  95% edp
--   adidas     10 known, 100% edt
--   benetton    5 known, 100% edt
--
-- For those houses an unlabelled release inherits the house's strength. This
-- covers ~1,520 more rows, taking coverage to ~40%.
--
-- Why it is safe enough to ship, unlike the AI pass:
--   * It is evidence-based per house, not a model's recollection.
--   * It is self-limiting. A house that genuinely makes both EDT and EDP
--     never reaches 90% agreement and is skipped entirely.
--   * It is auditable. The prior and its sample size are printed each run.
--   * It is reversible. These rows are tagged, so a single UPDATE removes
--     them, exactly as the 'ai' rows were removed.
--
-- Expect roughly 5-10% of house_prior rows to be wrong (~75-150 of 1,520).
-- That is the accepted cost of the coverage. If that ever stops being an
-- acceptable trade, delete them:
--
--   update public.fragrances
--   set concentrations = '{}', concentration = null, concentration_source = null
--   where concentration_source = 'house_prior';

alter type public.concentration_source_type add value if not exists 'house_prior';

comment on column public.fragrances.concentration_source is
  'Provenance of concentration/concentrations. name = stated in the fragrance name, feed = matched to a retailer SKU (most authoritative), house_prior = inherited from a house that releases >=90% one strength (inferred, ~5-10% error, wipeable), ai = model guess (retired, wiped in 0024). Any writer must set this.';
