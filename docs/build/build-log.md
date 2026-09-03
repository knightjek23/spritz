# Spritz Native Launch — Build Log

What actually shipped per slice, what deviated from the plan and why, and anything learned that changes later slices.

**Format:** `## Slice <n> — <name>` then Closed, Shipped, Deviations, Learned, Affects.

---

## Slice 0 — Map approved

- **Closed:** 2026-08-29
- **Shipped:** `docs/build/launch-one-pager.md`, `docs/build/build-map.md`, `docs/build/decisions.md`, this log.
- **Deviations:** None. `APP_STORE_LAUNCH.md` from July 21 is retained as the step-by-step runbook but is superseded by the one-pager wherever they disagree. Corrections are listed under "What changed since the July 21 runbook."
- **Learned:** The July runbook was silent on in-app account deletion, Play's closed-testing requirement, privacy manifests, and the Xcode 26 SDK floor. Any store rule older than about a month needs re-verification against primary sources before it is planned around.
- **Affects:** Added slice 4 (account deletion) and slice 3 (tester clock), neither of which existed in the runbook.

## Slice 1 — Accounts, agreements, banking

- **Opened:** 2026-08-29
- **Status:** In progress with Josh. Deliverables are `docs/build/slice-01-accounts.md` and `docs/build/slice-01-registration-tutorial.md`, both runbooks, since the whole slice is credential-gated.
- **Progress 2026-08-29:** Apple app record **created**. App Store Connect ID **6807149616**, name "Spritz: Fragrance Guide", version 1.0 in Prepare for Submission. Bundle ID `app.spritzofficial`, SKU `spritz-ios`, Full Access. Still outstanding on Apple: Paid Applications Agreement, tax, bank status "Clear", Small Business Program. Play side not started.
- **Decisions made:** D5 (store name "Spritz: Fragrance Guide"), D6 (Individual Apple enrollment), D7 (subtitle "Every fragrance, broken down.").
- **Learned:** Apple's public developer name is set once at first app-record creation and is not editable afterward, and Individual enrollments are forced to their legal name. This was not in the July runbook and would have been discovered at the point it became permanent. Verified at https://developer.apple.com/help/app-store-connect/create-an-app-record/set-your-developer-name
- **Affects:** Slice 9's ASO work. Neither the app name nor the subtitle contains a scan keyword now, so the keyword field must carry "scan", "scanner", "cologne", "perfume" and "notes", and the first screenshot has to show the scan action.

## Slice 4 (partial) — Public support and account-deletion pages

- **Closed:** 2026-09-01 (the public pages only; in-app deletion is still open)
- **Shipped:**
  - `app/support/page.tsx` — App Store Support URL target. Scan troubleshooting, missing fragrances, collections, Pro billing, data rights, contact.
  - `app/support/delete-account/page.tsx` — Google Play's required standalone public deletion URL. Works with no app and no sign-in.
  - `app/support/layout.tsx` — shares the legal pages' prose shell.
  - `components/prose-shell.tsx` — extracted from `app/legal/layout.tsx` so /support and /legal render identically. A support page styled unlike the privacy policy reads as an unfinished site to a reviewer.
  - `app/legal/layout.tsx` — now delegates to ProseShell. No visual change.
  - `app/legal/constants.ts` — `LEGAL_CONTACT` changed to `josh.knight@spritzofficial.online`; added `DELETE_ACCOUNT_PATH` and `SUPPORT_PATH`; `LEGAL_LAST_UPDATED` bumped to September 1, 2026.
  - `components/footer.tsx` — Support link added, nav relabelled "Legal and support".
  - `app/legal/privacy/page.tsx` — corrected a false claim, see below.
- **Deviations:** none from the plan, but two things were found and fixed in passing.
  - **The privacy policy claimed a feature that does not exist.** It read "You can also delete your account from your profile page at any time." There is no deletion control in `app/account/page.tsx`. App Review reads the privacy policy, and a policy promising a control the app lacks is a 5.1.1(v) finding waiting to happen. Now points to `/support/delete-account` instead. **Restore an in-app wording when slice 4 ships the real control.**
  - **`LEGAL_CONTACT` was `support@spritzofficial.app`**, with a code comment reading "Set this alias up before launch," so it may never have been a live mailbox.
- **Verified:** full `tsc --noEmit` times out on the OneDrive mount (known, see prelaunch-audit memory). Ran a targeted TypeScript parse plus import-resolution check over all 8 changed files instead. All clear. Visual verification still owed after deploy.
- **Learned:** Apple and Play want different shapes of the same thing. Apple requires deletion to be *initiated in-app*; Play requires a *public web URL* reachable without the app. Building the Play-shaped version first satisfies Apple's URL needs too, but does not satisfy Apple's in-app requirement.
- **Affects:** slice 4's remaining work is now only the in-app flow plus the server-side purge. Slice 9 can fill the Support URL and Play Data safety deletion URL fields.

## Slice 4 — In-app account deletion

- **Closed:** 2026-09-01
- **Shipped:**
  - `lib/account-deletion.ts` — `purgeAppUserData()`, the single implementation of the purge, idempotent by design.
  - `app/api/account/delete/route.ts` — POST, auth-gated, typed confirmation. Cancels Stripe → purges Supabase → deletes the Clerk user, in that order.
  - `components/account-actions.tsx` — `DeleteAccountSection`: collapsed by default, typed DELETE confirmation, blocking acknowledgement for store subscribers.
  - `app/account/page.tsx` — "Session" section became **Manage account**, holding sign out and delete. Dead `hi@spritz.app` address replaced with a link to /support.
  - `app/api/webhooks/clerk/route.ts` — the inline purge was replaced by a call to the shared one, and now returns 500 on failure so Clerk retries.
- **Design notes:**
  - **Order is load-bearing.** Stripe first, because a deleted account that keeps billing is the one outcome the user cannot fix. Supabase second, synchronously, so the API only reports success once data is gone; relying on the webhook alone would mean a misconfigured endpoint orphans data forever with no retry. Clerk last, because everything above looks records up by that id.
  - **Photos before the users row.** `scan_events.user_id` is `on delete set null`, so the moment the users row goes, every photo becomes unlinkable and therefore permanently undeletable. This was already documented in `lib/scan-image-store.ts` and the existing webhook honored it; the shared module preserves it.
  - **`fragrance_photos` was previously untouched by any deletion path.** Unapproved rows and their storage objects are now deleted; approved ones stay as library images with `clerk_user_id` scrubbed to `deleted-account`, which is what /support/delete-account promises.
  - **`scan_events` rows survive, anonymized** (user_id nulled by the FK, image_url nulled here). They carry no personal data once the photo is gone and they are what the 85% scan-accuracy metric is computed from. Deleting them would degrade that metric every time somebody leaves. Both the deletion page and the in-app copy were reworded to say this honestly rather than claiming the history is deleted.
- **Verified:** parse and import-resolution clean across 13 files, no unused imports. Server-side rendered `/support`, `/support/delete-account`, and the Manage account section in the cloud container against the repo's real `tailwind.config.ts` and `globals.css`, screenshotted at 430px. Correct hierarchy, no horizontal overflow on any of the three.
- **NOT verified, still owed:** a live end-to-end deletion against real Clerk, Stripe and Supabase. The purge is destructive and idempotent but has never been executed. Run it against a throwaway account before submission, and check that `users`, `collection_items`, `user_reactions` and the storage objects are actually gone.
- **Affects:** Apple 5.1.1(v) is now satisfiable. `/legal/privacy` should get its in-app deletion wording back, since the control now exists.

## Slice 4 — Purge verified, and two dead buckets found

- **Date:** 2026-09-01
- **Result:** `npm run test:purge` passes 9/9 with real data behind every assertion (`scanPhotosDeleted: 1`, `submittedPhotosDeleted: 1`, `libraryPhotosScrubbed: 1`, no warnings).
- **Proven:** photo deletion happens before the users row (the ordering the whole design hinges on); `collection_items` and `user_reactions` cascade; `scan_events` survives with `user_id` and `image_url` both nulled; the storage object is really gone; unapproved `fragrance_photos` are deleted and approved ones are kept with the owner scrubbed.
- **Still unproven:** the API route itself (auth gate, confirm phrase, Stripe cancellation, Clerk user deletion), the UI, and the Clerk webhook backstop. None of those can run until sign-in works, which needs either dev Clerk keys locally or a merge to production.

### The find: two of three storage buckets never existed

The first purge run failed to seed a photo. `listBuckets()` returned only `bottle-images`. `scan-images` and `user-bottle-images` were both absent, so three things had been silently broken in production, none of them related to account deletion:

1. **Every scan photo failed to save.** `storeScanImage()` returns null on any failure by design so a scan never breaks, which is exactly why it never surfaced. `/legal/privacy` and the camera-permission copy both told users their photos were kept. None were. Scan v2 called that archive "the only bottle image source we can actually license."
2. **The Google Lens fallback had never run once.** It needs a signed URL on `scan-images`. Real scan accuracy has been below the designed ceiling this whole time.
3. **User photo submission could not store its file.**

**Probable root cause:** the scan-v2 `supabase migration repair --status applied 0001…0022`, which marks migrations applied *without running them*. Anything in that range never actually executed is now permanently skipped by `db push`. The scan-v2 notes also record the `scan-images` bucket as "skipped by choice."

**Fixed by** `supabase/migrations/0027_storage_buckets.sql`. `scan-images` private, `user-bottle-images` public.

**Lesson worth keeping:** for migrations 0001-0022, a file existing in the repo is not evidence the migration ran. Verify the object exists before trusting a feature works.

### Tooling added
- `npm run test:purge` — seeds a throwaway user, runs the purge, asserts 9 outcomes, cleans up. Keyed to a generated `test-purge-*` id so it cannot touch real data.
- `npm run diag:infra` — read-only check of which buckets and tables actually exist.

## Slice 2 (in progress) — Capacitor iOS shell

- **Opened:** 2026-09-02. Shell added, runs in the Simulator, email sign-in through Clerk works.
- **Committed 2026-09-03:** `3028c4e` — `ios/`, `capacitor.config.ts`, `package.json`, `package-lock.json`. Capacitor 8.5.1.
- **Found on commit: the `allowNavigation` fix was never in the repo.** The 2026-09-02 session verified that email sign-in works once `server.allowNavigation: ["spritzofficial.app", "*.spritzofficial.app"]` is set, but `capacitor.config.ts` at HEAD had no such key and there was no uncommitted diff on the file either. That session lost its device link before writing it. Restored from the handoff and included in `3028c4e`. **Re-verify sign-in in the Simulator against the committed config before trusting it.**
- **Lesson worth keeping:** a fix that only ever existed in a running Simulator is not a fix. Commit the config change in the same session it is discovered.

### 2.1 — Safe-area CSS (`cad2cde`)

- **Shipped:** `viewportFit: "cover"` in `app/layout.tsx`; four inset tokens plus `--nav-pill-offset` and `--nav-clearance` in `app/globals.css`; token'd offsets in `components/bottom-nav.tsx`, `components/nav.tsx`, `components/camera-capture.tsx`, `app/scan/page.tsx`, `components/card-menu.tsx`, `components/family-pills.tsx`.
- **Decision:** D13.
- **Scope grew, deliberately.** The reported bug was the bottom nav only. Turning on `viewport-fit: cover` moves the whole page under the status bar too, so the top nav, the `/scan` camera takeover and its top control bar, and the two bottom sheets (`card-menu`, `family-pills`) all had to be brought along in the same change. Shipping cover without them would have traded one overlap bug for four.
- **Verified:** all 7 changed `.tsx` files parse clean. Rendered in Chromium at 393x852 against the real `:root` block, once with no insets and once with the tokens forced to a 59px top and 34px bottom: clearance 112px flat and 146px notched, the pill keeps its 24px gap above the safe area in both, page content clears the pill in both, and the nav row never starts above y=0.
- **NOT verified, still owed:** the real thing on a device. Chromium has no true `env()` values, so this proves the arithmetic and the layout response, not iOS's actual reported insets. Confirm in the Simulator and again on the iPhone 16 Pro (2.6).
- **Tooling note:** `npx tsc --noEmit` does not finish on the Mac inside the Cowork mount, and background processes there do not survive the shell that started them. The mount's shell also has no network, so `npm run dev` fails trying to fetch `next-swc`. Full typecheck and dev server both have to run from a normal Terminal on the Mac.
- **Affects:** slice 8's safe-area criterion is largely pre-satisfied. Any new fixed-position element from here uses the tokens.
