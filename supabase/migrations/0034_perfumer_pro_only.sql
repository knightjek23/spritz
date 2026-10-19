-- 0034_perfumer_pro_only.sql
--
-- Perfumer credits are a Pro feature. The app now enforces that in three
-- places (stripped from page props and API JSON, served only by the
-- Pro-checked /api/perfumer/[id], and Pro-gated /perfumers pages). This
-- migration closes the fourth path: going around the app entirely.
--
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ships to every browser by design, and
-- public.fragrances has had a public-read RLS policy since 0001. So without
-- this, anyone could lift the key from the page and run
--   GET /rest/v1/fragrances?select=name,perfumer
-- and read every credit for free.
--
-- RLS works on rows, not columns, so the fix is column-level privileges:
-- anon and authenticated keep SELECT on every fragrances column EXCEPT
-- perfumer. The app's server uses the service_role key, which is
-- unaffected, so nothing in the app changes.
--
-- Safe because no app code queries Supabase as anon or authenticated (all
-- reads go through createAdminClient on the server), and no RPC is SECURITY
-- DEFINER (verified Oct 2026), so every function runs with its caller's
-- privileges. Side effect, intended: an anon caller of a catalog RPC that
-- selects f.perfumer (find_fragrances_by_house, search_fragrances, the note
-- and family browse functions) now gets "permission denied for column
-- perfumer" instead of the credit.
--
-- MAINTENANCE: column grants are explicit, so a column ADDED to fragrances
-- after this migration is not readable by anon until granted. That only
-- matters if browser code ever starts querying Supabase directly, which it
-- does not today. Re-run the DO block below after adding a column if it does.

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'fragrances'
     and column_name <> 'perfumer';

  execute 'revoke select on public.fragrances from anon, authenticated';
  execute format('grant select (%s) on public.fragrances to anon, authenticated', cols);
end $$;

-- The perfumer browse RPCs (0033) exist only to serve Pro pages. Server-only.
revoke execute on function public.list_perfumers(int)                     from anon, authenticated;
revoke execute on function public.find_fragrances_by_perfumer(text, int)  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify (run as anon in the SQL editor: `set role anon;` ... `reset role;`)
--   select name from public.fragrances limit 1;      -- works
--   select perfumer from public.fragrances limit 1;  -- permission denied
-- ---------------------------------------------------------------------------
