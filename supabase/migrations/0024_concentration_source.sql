-- 0024_concentration_source.sql
--
-- Records WHERE each fragrances.concentration value came from.
--
-- Why this exists: as of Aug 2026 the concentration column was ~93% wrong.
-- Two compounding causes, both invisible without provenance:
--
--   1. backfill-concentration.ts parses the strength out of the fragrance
--      name. Its comment claims 60-80% coverage. Measured against the real
--      11,668-row parsed catalog it fires on 6.4%, because Fragrantica names
--      the flagship bare ("Sauvage", "Aventus"), not "Sauvage Eau de Toilette".
--
--   2. Worse, that 6.4% is itself skewed. Fragrantica gives the ORIGINAL
--      (usually the EDT) the bare name and only appends "Eau de Parfum" to
--      the later flanker. So name-parsing systematically finds EDPs and
--      misses EDTs (38 EDP vs 14 EDT in a 1,459-row sample).
--
--   3. infer-concentration.ts then asked gpt-4o-mini to fill the remaining
--      93.6%, with a prompt stating EDP is "the default for most modern
--      niche and designer releases". The model answered edp at high
--      confidence nearly every time, which sailed past the >= 0.7 gate --
--      the model was not uncertain, it was confidently wrong.
--
-- Net effect: users saw EDP on essentially every fragrance, including
-- famous EDTs. Ground truth from FragranceNet's 34,480 retail SKU titles
-- (actual bottles) is roughly a 45/55 EDT/EDP split.
--
-- Without this column there is no way to tell a trustworthy parsed value
-- from a guess, so no repair can know what is safe to overwrite. Every
-- writer of `concentration` must now also set `concentration_source`.
--
--   name    parsed from an explicit keyword in the fragrance name. Reliable.
--   feed    parsed from a retailer's SKU title (FragranceNet, FragranceShop,
--           Nicchia, Perfumania). Most authoritative: a real bottle listing.
--   ai      inferred by a language model. Treated as untrusted; the repair
--           script wipes these.

do $$ begin
  create type public.concentration_source_type as enum ('name', 'feed', 'ai');
exception
  when duplicate_object then null;
end $$;

alter table public.fragrances
  add column if not exists concentration_source public.concentration_source_type;

-- Backfill provenance for what is already there, by re-running the same
-- name-parse the app uses. Anything with a concentration whose name does
-- NOT explain it must have come from the AI pass, so mark it 'ai' and let
-- the repair script decide its fate.
--
-- Order matters exactly as it does in lib/concentrations.ts: "Eau de
-- Parfum" contains "parfum", so the two-word phrases must be tested before
-- the standalone word or every EDP would be tagged Parfum.
update public.fragrances
set concentration_source = case
  when concentration is null then null
  when name ~* '\meau\s+de\s+parfum\M'   and concentration = 'edp'     then 'name'
  when name ~* '\meau\s+de\s+toilette\M' and concentration = 'edt'     then 'name'
  when name ~* '\mextrait\M'             and concentration = 'extrait' then 'name'
  when name ~* '\mparfum\M'              and concentration = 'parfum'  then 'name'
  when name ~* '\medp\M'                 and concentration = 'edp'     then 'name'
  when name ~* '\medt\M'                 and concentration = 'edt'     then 'name'
  else 'ai'
end::public.concentration_source_type
where concentration_source is null;

create index if not exists fragrances_concentration_source_idx
  on public.fragrances (concentration_source);

comment on column public.fragrances.concentration_source is
  'Provenance of concentration. name = parsed from fragrance name, feed = retailer SKU title (most authoritative), ai = model guess (untrusted). Any writer of concentration must set this.';
