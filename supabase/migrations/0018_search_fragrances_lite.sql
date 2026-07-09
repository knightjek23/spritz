-- =====================================================================
-- 0018_search_fragrances_lite.sql
--
-- Why: /api/search (typeahead + search page) was returning the FULL
-- fragrance row per hit — notes jsonb, house_history, wear_guidance,
-- editorial, dupes — 20 rows of it per keystroke. The UI renders only
-- id, name, house, year, family[0], bottle_image_url. Responses could
-- hit 50-200KB where ~2KB is used.
--
-- Same trigram matching + scoring as search_fragrances (0004); only the
-- select list is slimmed. The full function stays for /api/scan, which
-- does use the complete row.
-- =====================================================================

create or replace function public.search_fragrances_lite(
  p_brand text,
  p_name  text,
  p_limit int default 10
)
returns table (
  id               uuid,
  name             text,
  house            text,
  family           text[],
  year             int,
  bottle_image_url text,
  match_score      real
)
language sql
stable
as $$
  select
    f.id, f.name, f.house, f.family, f.year, f.bottle_image_url,
    (0.65 * similarity(f.name,  p_name)
   + 0.35 * similarity(f.house, p_brand))::real as match_score
  from public.fragrances f
  where f.name  % p_name
     or f.house % p_brand
  order by match_score desc
  limit p_limit;
$$;

grant execute on function public.search_fragrances_lite(text, text, int)
  to anon, authenticated, service_role;
