-- 0012_consensus_columns.sql
--
-- Adds the "community consensus" Pro feature columns to `fragrances`.
-- Mirrors the shape of the dupes columns (single jsonb-ish record cached
-- per fragrance, populated by AI on first Pro request, returned from
-- cache on subsequent requests).
--
-- consensus_summary       — 2-3 paragraphs synthesizing what users say
-- consensus_verdict       — short "worth the buy?" line
-- consensus_pros          — array of what users praise
-- consensus_cons          — array of what users criticize
-- consensus_confidence    — model self-rated 0-1 (low for new/niche
--                            fragrances with no community signal)
-- consensus_generated_at  — for the UI's "Generated [date]" receipt
--
-- All nullable so existing rows aren't broken; populated lazily by
-- /api/consensus/[id] on first Pro user request, then cached forever
-- (until manually cleared for a re-generate).

alter table public.fragrances
  add column if not exists consensus_summary text,
  add column if not exists consensus_verdict text,
  add column if not exists consensus_pros text[],
  add column if not exists consensus_cons text[],
  add column if not exists consensus_confidence numeric,
  add column if not exists consensus_generated_at timestamptz;
