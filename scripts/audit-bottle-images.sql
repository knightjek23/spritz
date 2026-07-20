-- audit-bottle-images.sql
--
-- Diagnoses the three ways a bottle thumbnail goes wrong in the card
-- rows (trending, popular-by-house, house/family scrollers):
--
--   1. NULL          — no image at all (YSL Myslf case). Renders house
--                      initials. Honest, but the card looks empty.
--   2. PLACEHOLDER   — Fragrantica's "IMAGE COMING SOON" graphic stored
--                      as if it were a real photo (Chanel No 5 EDT case).
--                      Loads fine, looks broken.
--   3. DEAD LINK     — URL that 404s (YSL Libre case). Can't be detected
--                      from SQL; the app now falls back gracefully via
--                      components/bottle-image.tsx onError.
--
-- Run each query separately in the Supabase SQL editor.

-- =====================================================================
-- Query 1: THE IMPORTANT ONE. Find placeholder URLs empirically.
--
-- A real bottle photo is unique to one fragrance. A placeholder graphic
-- is reused across every fragrance that lacks a photo. So any URL shared
-- by 2+ rows is almost certainly a placeholder — and the count tells you
-- how many rows it's polluting.
--
-- Whatever URLs this returns are the real placeholder URLs. Paste them
-- to Claude (or add matching patterns to PLACEHOLDER_PATTERNS in
-- lib/bottle-image.ts) so write-time and read-time detection agree.
-- =====================================================================
select
  bottle_image_url,
  count(*) as rows_using_it,
  min(name) as example_fragrance
from public.fragrances
where bottle_image_url is not null
group by bottle_image_url
having count(*) > 1
order by count(*) desc
limit 20;


-- =====================================================================
-- Query 2: Coverage overview. How big is the missing-image problem?
-- =====================================================================
-- select
--   count(*) as total,
--   count(bottle_image_url) as has_url,
--   count(*) - count(bottle_image_url) as null_url,
--   round(100.0 * count(bottle_image_url) / count(*), 1) as pct_with_url
-- from public.fragrances;


-- =====================================================================
-- Query 3: Missing images among the fragrances that actually get seen.
-- A null image on rank 6,000 doesn't matter; a null on rank 12 does.
-- These are the ones worth sourcing photos for by hand.
-- =====================================================================
-- select popularity_rank, house, name
-- from public.fragrances
-- where bottle_image_url is null
--   and popularity_rank is not null
-- order by popularity_rank
-- limit 50;


-- =====================================================================
-- Query 4: After Query 1 confirms the placeholder URLs, null them out
-- so the UI shows initials instead of a fake bottle. Replace the URL
-- list with the actual values from Query 1 before running.
-- =====================================================================
-- update public.fragrances
-- set bottle_image_url = null
-- where bottle_image_url in (
--   'PASTE_PLACEHOLDER_URL_FROM_QUERY_1'
-- );
