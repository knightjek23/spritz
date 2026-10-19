-- Houses library page went back to neutral cards (2026-10-10); the
-- dominant-family lookup from 0031 has no callers. Kept 0031 in history so
-- `supabase db push` stays in sync with the remote migration table.
drop function if exists public.list_house_families(int);
