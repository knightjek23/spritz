-- 0025_concentrations_set.sql
--
-- Concentration becomes a SET, because a fragrance is not one strength.
--
-- The scalar `concentration` column added in 0014 encodes a question that is
-- malformed for most of the catalog's popular entries. "Bleu de Chanel" does
-- not have a concentration: it ships as an EDT, an EDP and a Parfum, and
-- Fragrantica models all three under one entry. Asking which one it "is" has
-- no answer, so the repair script had to leave those rows NULL.
--
-- That failure lands exactly where it hurts most. Measured Aug 2026, after
-- the 0024 repair:
--
--   top 100        33.0% had a value
--   top 500        25.3%
--   top 2000       16.4%
--   long tail       6.4%
--
-- The most-viewed fragrances were the WORST covered, and not by accident:
-- the more famous a fragrance, the more certain the house is to have released
-- it in several strengths, and the more certain the scalar column is to be
-- unanswerable. Retail feeds report all three correctly; the schema was
-- throwing that away.
--
-- So: store every strength the fragrance is sold in.
--
--   concentrations = {edt, edp, parfum}   ->  "Available as: EDT, EDP, Parfum"
--   concentrations = {edp}                ->  "Eau de Parfum" (reads as before)
--   concentrations = {}                   ->  UI hides the field
--
-- This is also the more useful answer for a user standing in a shop deciding
-- which bottle to buy.
--
-- `concentration` (scalar) is KEPT and stays in sync as the single-value
-- case, so existing reads do not break during the UI transition. It is now
-- derived: set on exactly one member, NULL otherwise. Treat it as read-only
-- legacy; write `concentrations`.

alter table public.fragrances
  add column if not exists concentrations public.concentration_type[]
    not null default '{}';

-- Seed from whatever the scalar already holds, so no data is lost when the
-- UI switches over. Rows the repair script left NULL stay empty and will be
-- filled by the next `pnpm repair:concentration` run, which no longer
-- discards multi-strength matches.
update public.fragrances
set concentrations = array[concentration]
where concentration is not null
  and cardinality(concentrations) = 0;

-- GIN index: the library will want "show me everything available as an
-- Extrait", which is a containment query over the array.
create index if not exists fragrances_concentrations_idx
  on public.fragrances using gin (concentrations);

comment on column public.fragrances.concentrations is
  'Every strength this fragrance is sold in. A fragrance is not one strength: Bleu de Chanel ships as EDT, EDP and Parfum. Empty array means unknown. Write this; `concentration` is legacy and only mirrors the single-value case.';

comment on column public.fragrances.concentration is
  'LEGACY, read-only. Mirrors concentrations when it has exactly one member, NULL otherwise. Kept so pre-0025 reads keep working. Write concentrations instead.';
