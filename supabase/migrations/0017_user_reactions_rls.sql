-- 0017: Enable RLS on user_reactions.
--
-- Every other table got `enable row level security` in 0001; user_reactions
-- was added later (0013) and missed it. Without RLS, the anon key has full
-- CRUD on the table via PostgREST — anyone could dump or modify every
-- user's reaction history without auth.
--
-- The app only touches this table through the service-role client (which
-- bypasses RLS), so enabling RLS with no policies locks out anon/authed
-- roles entirely while changing nothing for the app.

alter table public.user_reactions enable row level security;
