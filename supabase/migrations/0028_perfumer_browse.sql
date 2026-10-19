-- 0028_perfumer_browse.sql
--
-- Browse-by-perfumer: /perfumers (index) and /perfumer/[slug] (detail).
--
-- `fragrances.perfumer` has existed since 0001 and is populated by the
-- scraper from Fragrantica's /noses/ credit link. It is a single string:
-- the FIRST credited nose. Co-authored fragrances therefore only appear
-- under their lead perfumer. Capturing every credit needs a scraper change
-- plus a re-scrape; this migration works with the data as it is.
--
-- Matching is on a normalized form of the stored name (trimmed, internal
-- whitespace collapsed, lowercased), so "Jacques Polge" and "jacques  polge "
-- land on the same page. URL slugs are deliberately NOT computed here: the
-- app derives them in lib/perfumers.ts (which also folds accents, so
-- "Céline Ellena" becomes celine-ellena rather than c-line-ellena) and
-- resolves a slug back to the exact stored name via list_perfumers. One
-- slug implementation, in one language, means the two can never drift.
--
-- Both functions enumerate columns explicitly. `select f.*` would drag the
-- note_vector embedding along and, in a `returns table` function, collide
-- positionally with the declared columns (see the note in 0007).

-- Expression index so the per-perfumer lookup is not a full scan.
create index if not exists fragrances_perfumer_norm_idx
  on public.fragrances (lower(regexp_replace(btrim(perfumer), '\s+', ' ', 'g')))
  where perfumer is not null;

-- ---------------------------------------------------------------------------
-- Every credited perfumer with a fragrance count and their best-ranked work.
-- best_rank lets the index lead with the noses people actually know.
-- ---------------------------------------------------------------------------
create or replace function public.list_perfumers(p_limit int default 5000)
returns table (
  perfumer        text,
  fragrance_count int,
  best_rank       int
)
language sql
stable
as $$
  select
    -- Most common spelling wins as the display name.
    mode() within group (order by regexp_replace(btrim(f.perfumer), '\s+', ' ', 'g')) as perfumer,
    count(*)::int                  as fragrance_count,
    min(f.popularity_rank)::int    as best_rank
  from public.fragrances f
  where f.perfumer is not null
    and btrim(f.perfumer) <> ''
  group by lower(regexp_replace(btrim(f.perfumer), '\s+', ' ', 'g'))
  order by count(*) desc, min(f.popularity_rank) asc nulls last
  limit p_limit;
$$;

grant execute on function public.list_perfumers(int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Every fragrance by one perfumer, most popular first. Narrow by design:
-- the perfumer page renders a list and a top-10 scroller, nothing more.
-- ---------------------------------------------------------------------------
create or replace function public.find_fragrances_by_perfumer(
  p_name  text,
  p_limit int default 300
)
returns table (
  id               uuid,
  name             text,
  house            text,
  year             int,
  family           text[],
  bottle_image_url text,
  popularity_rank  int,
  perfumer         text
)
language sql
stable
as $$
  select
    f.id, f.name, f.house, f.year, f.family,
    f.bottle_image_url, f.popularity_rank, f.perfumer
  from public.fragrances f
  where lower(regexp_replace(btrim(f.perfumer), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_name),     '\s+', ' ', 'g'))
  order by f.popularity_rank asc nulls last, f.name asc
  limit p_limit;
$$;

grant execute on function public.find_fragrances_by_perfumer(text, int)
  to anon, authenticated, service_role;
