-- 0015_popularity_score.sql
--
-- Adds a scratchpad `popularity_score` column (0-10 float) that the AI
-- infer-popularity backfill populates per fragrance. Once every row has
-- a score, a single ORDER BY + row_number() SQL converts scores into
-- popularity_rank (existing integer column, 1 = most popular).
--
-- Kept AS a real column rather than a purely-in-memory phase-1 output
-- so the script is resumable — if it dies mid-scoring, the next run
-- picks up where the last left off via WHERE popularity_score IS NULL.
--
-- After the ranking step runs, popularity_score can either stay (useful
-- for future weighted-sum recommendations) or get dropped in a later
-- migration if we want to keep the schema minimal.

alter table public.fragrances
  add column if not exists popularity_score numeric;
