-- Add `dupes` column to fragrances table.
-- Stores curated dupe relationships authored in editorial/fragrances/*.md frontmatter.
-- Format: array of {house, name, similarity, note, price_tier?}.

alter table public.fragrances
  add column if not exists dupes jsonb default '[]'::jsonb;

comment on column public.fragrances.dupes is
  'Curated dupe relationships from editorial. Format: [{house, name, similarity, note, price_tier?}].';
