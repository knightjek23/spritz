-- =====================================================================
-- 0011_longevity_projection_descriptions.sql
--
-- Adds plain-English descriptions for fragrance performance, alongside
-- the existing numeric scores:
--   - longevity_description: how the wear time reads in practice
--     ("Wears all day, still detectable on clothes the next morning")
--   - projection_description: how the scent travels off the skin
--     ("Sits close to skin until warmth wakes it up — an intimate scent")
--
-- These are intended as the beginner-friendly companions to
-- longevity_score (hours) and sillage_score (0-1). Session 01 surfaced
-- that the existing numeric scores are useful for collectors but
-- opaque to first-time fragrance buyers; descriptions give the same
-- information in language that works without prior knowledge.
--
-- "Sillage" was the original column name (industry term for how far a
-- scent projects). The plain-English UI surface renames it to
-- "Projection" — the column stays sillage_score for back-compat but
-- the description column uses the friendlier name.
-- =====================================================================

alter table public.fragrances
  add column if not exists longevity_description text,
  add column if not exists projection_description text;

comment on column public.fragrances.longevity_description is
  'Plain-English description of how long the fragrance wears in practice. Editorial-written, optional. Complements the numeric longevity_score.';

comment on column public.fragrances.projection_description is
  'Plain-English description of how far the fragrance projects off skin. Editorial-written, optional. Complements the numeric sillage_score (industry term for projection).';
