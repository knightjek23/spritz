-- Create the two storage buckets the app has always referenced but which were
-- never actually created in the project.
--
-- Found 2026-09-01 while testing account deletion: `npm run test:purge` failed
-- to seed a scan photo with "Bucket not found", and listBuckets() returned only
-- `bottle-images`. The code references three:
--
--   bottle-images       EXISTS. Catalog images mirrored by the scraper.
--   scan-images         MISSING. lib/scan-image-store.ts writes retained scan
--                       photos here, and lib/web-lookup.ts uploads here to
--                       build the signed URL for the Google Lens fallback.
--   user-bottle-images  MISSING. app/api/fragrance-photos/[id] uploads
--                       user-submitted catalog photos here.
--
-- Consequences while they were missing, all silent:
--   1. Every scan photo failed to save. storeScanImage() returns null on any
--      failure by design so a scan never breaks, so nothing ever surfaced.
--      /legal/privacy and the camera-permission copy both tell users we keep
--      their photos. We were keeping none.
--   2. The Google Lens web fallback could never run. It needs a signed URL on
--      scan-images, so that entire scan-v2 branch has never executed in
--      production.
--   3. User photo submission could not store its file.
--
-- Visibility is deliberate and load-bearing:
--   scan-images is PRIVATE. These are photos taken in people's homes and
--   stores; nothing here should be reachable by guessing a URL. Access is via
--   signed URLs and the service role only.
--   user-bottle-images is PUBLIC, because approved photos are served as
--   catalog images.
--
-- No RLS policies are added. Both buckets are written only by the service
-- role, which bypasses RLS, and public read on user-bottle-images comes from
-- the bucket's `public` flag.

insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('user-bottle-images', 'user-bottle-images', true)
on conflict (id) do nothing;
