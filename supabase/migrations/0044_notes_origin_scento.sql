-- 0044_notes_origin_scento.sql
--
-- Allow 'scento' as a notes origin in the server-only provenance table.
--
-- Scento publishes a perfume notes dataset under CC BY 4.0
-- (https://github.com/Scento-com/perfume-dataset). Rows whose notes are
-- replaced from it by scraper/src/import-scento-notes.ts are recorded with
-- notes_origin = 'scento', and the licence requires the attribution
-- "Scento - https://www.scento.com/perfume-database" wherever those notes
-- are shown. The sources footer reads notes_source_url, which for these rows
-- is the fragrance's page on scento.com.
--
-- Additive: widens one check constraint. No row changes.

alter table public.fragrance_provenance
  drop constraint if exists fragrance_provenance_notes_origin_check;

alter table public.fragrance_provenance
  add constraint fragrance_provenance_notes_origin_check
  check (notes_origin in ('fragrantica', 'brand', 'retailer', 'scento', 'unknown'));

-- Check after `supabase db push` (should list the five values above):
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'fragrance_provenance_notes_origin_check';
