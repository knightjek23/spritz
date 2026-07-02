-- 0014_fragrance_concentration.sql
--
-- Adds a `concentration` column to public.fragrances so we can
-- categorize each entry by its four canonical strengths:
--   edt      - Eau de Toilette   (5-15% aromatic oils)
--   edp      - Eau de Parfum     (15-20%)
--   parfum   - Parfum            (20-30%)
--   extrait  - Extrait de Parfum (25-40%)
--
-- Populated by scraper/src/backfill-concentration.ts (parses from the
-- fragrance name when explicit — most flanker variants like "Bleu de
-- Chanel Eau de Parfum" carry the concentration in the name itself).
-- Rows where the name gives no clue stay NULL; the UI hides the field
-- when unset rather than guessing.

do $$ begin
  create type public.concentration_type as enum (
    'edt', 'edp', 'parfum', 'extrait'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.fragrances
  add column if not exists concentration public.concentration_type;
