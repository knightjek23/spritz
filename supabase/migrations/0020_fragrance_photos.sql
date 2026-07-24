-- 0020_fragrance_photos.sql
--
-- User-generated bottle photos. The foundation for owning our own image
-- library: a user holding the bottle when they scan can add a photo, which
-- we license via the ToS and, after moderation, promote to the fragrance's
-- catalog image. This is the legally-clean, fully-owned alternative to
-- scraped or affiliate-fed images.
--
-- One-time Storage setup (Supabase dashboard, do this before the API runs):
--   Storage -> New bucket -> name: "user-bottle-images" -> set Public.
--   Public read so approved photos render like any other bottle image. Note
--   this bucket is NOT in the app's blocked-source list (unlike the old
--   "bottle-images" mirror bucket), so its URLs display normally.
--
-- Moderation model: every upload lands status='pending' and is shown to NO
-- ONE until reviewed. Approving a photo (see 0020 note below) sets
-- fragrances.bottle_image_url to its public Storage URL, after which it
-- renders everywhere through the existing image code. This keeps unreviewed
-- user content off the public catalog.

create table if not exists public.fragrance_photos (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references public.fragrances(id) on delete cascade,
  clerk_user_id text not null,
  storage_path  text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);

create index if not exists fragrance_photos_fragrance_status_idx
  on public.fragrance_photos (fragrance_id, status);
create index if not exists fragrance_photos_user_idx
  on public.fragrance_photos (clerk_user_id);

-- All access is through the service-role API (which bypasses RLS). Enable
-- RLS with no permissive policies so the anon/authenticated keys can't read
-- or write the table directly.
alter table public.fragrance_photos enable row level security;

-- Approving a photo (manual moderation for now — run per approved row):
--   update public.fragrance_photos
--   set status = 'approved', reviewed_at = now()
--   where id = '<photo_id>';
--
--   update public.fragrances
--   set bottle_image_url =
--     '<SUPABASE_URL>/storage/v1/object/public/user-bottle-images/<storage_path>'
--   where id = '<fragrance_id>';
