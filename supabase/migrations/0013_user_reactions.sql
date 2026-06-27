-- 0013_user_reactions.sql
--
-- Per-user Like / Dislike reactions on fragrances. Independent from the
-- collection (own / tried / wishlist) — a user can react to a fragrance
-- they don't own, and dropping a fragrance from their shelf doesn't
-- clear their reaction.
--
-- Toggle semantics enforced in the API route, not the DB: the PK
-- constraint ensures one reaction per (user, fragrance), and the API
-- upserts/deletes to achieve toggle behavior.

-- Postgres has no `CREATE TYPE IF NOT EXISTS`. The DO block swallows
-- the duplicate_object error on re-runs so this migration stays
-- idempotent (safe to apply twice).
do $$ begin
  create type public.reaction_type as enum ('like', 'dislike');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_reactions (
  user_id       uuid not null references public.users(id) on delete cascade,
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  reaction      public.reaction_type not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  primary key (user_id, fragrance_id)
);

-- Look up "what did user X react to" — used by the shelf endpoint to
-- bundle reactions into the collection response in one round trip.
create index if not exists user_reactions_user_idx
  on public.user_reactions(user_id);
