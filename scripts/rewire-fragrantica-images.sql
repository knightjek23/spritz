-- rewire-fragrantica-images.sql
--
-- TEMPORARY (pre-launch, affiliate-review window only).
--
-- Most rows lost their bottle_image_url in the earlier removal, so the
-- cards show house-initials placeholders. This rebuilds the Fragrantica
-- thumbnail URL for every catalog row from the perfume id already stored
-- in fragrantica_url. Pattern (confirmed against currently-rendering rows):
--   fragrantica_url  ...-55805.html
--   image            https://fimgs.net/mdimg/perfume-thumbs/375x500.55805.jpg
--
-- Display is still gated by NEXT_PUBLIC_SHOW_SCRAPED_IMAGES in the app, so
-- with the flag OFF these URLs sit in the column but render as placeholders.
-- With the flag ON (review window), every card shows its bottle.
--
-- This re-introduces the fimgs hotlink exposure you chose to accept for the
-- review window. Before public launch: turn the flag off, and ideally clear
-- these again with scripts/blank-unlicensed-images.sql once user-uploaded /
-- affiliate images have backfilled the catalog.
--
-- Run in the Supabase SQL editor.

-- 1. Preview: how many rows will get a reconstructed URL.
select count(*) as rows_to_wire
from public.fragrances
where fragrantica_url ~ '-\d+\.html'
  and (bottle_image_url is null or bottle_image_url ilike '%fimgs.net%');

-- 2. The rewire. Uncomment and run once the preview looks right.
-- update public.fragrances
-- set bottle_image_url =
--   'https://fimgs.net/mdimg/perfume-thumbs/375x500.'
--   || substring(fragrantica_url from '-(\d+)\.html')
--   || '.jpg'
-- where fragrantica_url ~ '-\d+\.html'
--   and (bottle_image_url is null or bottle_image_url ilike '%fimgs.net%');

-- 3. Confirm coverage (has_image should be close to total).
-- select count(*) as total, count(bottle_image_url) as has_image
-- from public.fragrances;
