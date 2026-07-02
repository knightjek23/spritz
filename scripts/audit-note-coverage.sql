-- audit-note-coverage.sql
--
-- Enumerate every distinct note name in the catalog and flag the ones
-- that would 404 on /note/[slug] because there's no editorial file OR
-- alias covering that slug.
--
-- Run this in Supabase SQL editor. Copy the "missing_slugs" column into
-- an audit doc and either (a) add each as an alias in an existing
-- editorial/notes/*.md, (b) author a new editorial file, or (c) leave
-- as-is if the note is genuinely one-off/junk.
--
-- Why this exists: the /note/[slug] page renders successfully when
-- either the editorial loader OR the RPC returns something. It 404s
-- when both fail. The RPC does exact-match on lower(name), so any
-- slug that doesn't map to a catalog note name AND doesn't match an
-- editorial file/alias will hit the 404 path (e.g. Ambrofix, which
-- shares a molecule with Ambroxan but is a different brand name).

-- Every distinct note name across all layers.
with all_notes as (
  select distinct lower(trim(n->>'name')) as note_name
  from public.fragrances f,
       jsonb_array_elements(
         coalesce(f.top_notes,  '[]'::jsonb)
         || coalesce(f.mid_notes, '[]'::jsonb)
         || coalesce(f.base_notes,'[]'::jsonb)
       ) n
  where n->>'name' is not null
    and length(trim(n->>'name')) > 0
)
select
  note_name,
  -- Same slug rule the app uses: lowercase, hyphenated, no punctuation
  regexp_replace(
    regexp_replace(lower(note_name), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  ) as candidate_slug,
  (
    select count(*)
    from public.fragrances f,
         jsonb_array_elements(
           coalesce(f.top_notes, '[]'::jsonb)
           || coalesce(f.mid_notes, '[]'::jsonb)
           || coalesce(f.base_notes, '[]'::jsonb)
         ) n
    where lower(n->>'name') = all_notes.note_name
  ) as fragrance_count
from all_notes
order by fragrance_count desc;
