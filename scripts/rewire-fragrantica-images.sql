-- rewire-fragrantica-images.sql
--
-- TEMPORARY (pre-launch, affiliate-review window only).
--
-- Rebuilds the Fragrantica thumbnail URL for EVERY catalog row from the
-- perfume id already stored in fragrantica_url, overwriting whatever is
-- there now (most rows point at a dead / mirror URL, which is why the
-- cards show placeholders). Pattern (confirmed against rendering rows):
--   fragrantica_url  ...-55805.html
--   image            https://fimgs.net/mdimg/perfume-thumbs/375x500.55805.jpg
--
-- Display is controlled in code by BLOCK_UNLICENSED_SOURCES in
-- lib/bottle-image.ts (currently false = shown). Before public launch:
-- flip that to true and clear these URLs with blank-unlicensed-images.sql
-- once user-uploaded / affiliate images have backfilled the catalog.
--
-- Run in the Supabase SQL editor.

-- 1. Diagnostic: what's in the column right now, and how many rows have a
--    usable Fragrantica id. (Run this first to understand the state.)
select
  case
    when bottle_image_url is null then 'NULL'
    when bottle_image_url ilike '%fimgs.net%' then 'fimgs.net'
    when bottle_image_url ilike '%/bottle-images/%' then 'supabase mirror'
    else 'other'
  end as current_kind,
  count(*) as rows
from public.fragrances
group by 1
order by 2 desc;

select count(*) as rows_with_fragrantica_id
from public.fragrances
where fragrantica_url ~ '-\d+\.html';

-- 2. The rewire: overwrite EVERY row that has a Fragrantica id. Uncomment
--    and run once the diagnostic above looks right (rows_with_fragrantica_id
--    should be most of the catalog).
-- update public.fragrances
-- set bottle_image_url =
--   'https://fimgs.net/mdimg/perfume-thumbs/375x500.'
--   || substring(fragrantica_url from '-(\d+)\.html')
--   || '.jpg'
-- where fragrantica_url ~ '-\d+\.html';

-- 3. Confirm coverage (has_image should be close to total).
-- select count(*) as total, count(bottle_image_url) as has_image
-- from public.fragrances;
