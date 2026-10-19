-- Dominant family per house, for the colour-coded /houses library page.
--
-- A house has no colour of its own; it borrows the swatch of the family
-- most of its catalog rows carry (first family tag per fragrance,
-- normalised through normalize_family so "warm spicy" counts as spicy).
-- One row per house, the single most common family and how many rows
-- carried it. Houses whose rows all lack a family are omitted; the page
-- falls back to the neutral paper card for them.

create or replace function public.list_house_families(p_limit int default 2000)
returns table (
  house   text,
  family  text,
  n       int
)
language sql
stable
as $$
  with primary_family as (
    select
      f.house,
      public.normalize_family(f.family[1]) as family
    from public.fragrances f
    where f.house is not null
      and length(f.house) > 0
      and f.family is not null
      and array_length(f.family, 1) >= 1
  ),
  counted as (
    select house, family, count(*)::int as n,
           row_number() over (partition by house order by count(*) desc, family asc) as rn
    from primary_family
    where family is not null and length(family) > 0
    group by house, family
  )
  select house, family, n
  from counted
  where rn = 1
  order by n desc, house asc
  limit p_limit;
$$;

grant execute on function public.list_house_families(int)
  to anon, authenticated, service_role;
