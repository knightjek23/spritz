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

### 2.2 — Google OAuth via system browser (`3bf2008`), 2.3 — Sign in with Apple (`a8a2d9c`)

- **Shipped:** `lib/native.ts` (`isNativeApp()`, the html `native-app` class), `lib/native-auth.ts`, `lib/native-auth-cookie.ts`, `app/native-auth/{start,go,callback,complete}`, `components/native-auth-bridge.tsx`, `components/native-social-buttons.tsx`, sign-in and sign-up pages, `Info.plist` URL scheme `app.spritzofficial`, deps `@capacitor/app` 8.1.1 and `@capacitor/browser` 8.0.4.
- **Decisions:** D14 (browser + deep link + Clerk sign-in token), D15 (Apple via the same path; native sheet reversed after the pinned SDK turned out not to support it). Design: `docs/superpowers/specs/2026-09-03-slice-2.2-native-oauth-design.md`.
- **Verified:** parse-clean; the client half exercised in Node against a stubbed Browser plugin: nonce shape, foreign URLs dropped, mismatched nonce dropped silently (AC 3), happy path `create(ticket)` → `setActive` → `Browser.close` (AC 2), replay dropped, expired ticket surfaces a recoverable error (AC 4). Info.plist validates.
- **NOT verified, owed:** the browser leg against real Clerk and Google, the sign-in-to-sign-up transfer for a first-time Google account, the `Open in Spritz?` prompt cost, and the deep link on a device (AC 1, 2, 5). Web unchanged (AC 6) is by construction (`.native-app` gate) but needs one browser pass after deploy.
- **Needs Josh:** Apple enabled as a Clerk social connection (Services ID + key). `npm install && npx cap sync ios`.
- **Near miss:** `3bf2008` changed `package.json` without the lockfile and was pushed. Vercel's `npm ci` refuses out-of-sync lockfiles, so production deploys were broken from that push until `6aba544`. Lesson: a dependency change is not committable from the Cowork mount alone, since it has no network to run `npm install`; generate the lockfile in the container and commit both together.
- **Affects:** slice 7 now has `isNativeApp()` and the `.native-app` CSS gate to hide Stripe behind. Slice 6's native camera reuses the purpose string from D17.

### 2.4 — Icon and splash (`2c6c85c`), 2.5 — Info.plist (`f8b651b`)

- **Shipped:** 1024 opaque icon from `public/icon-512.png`; 2732 cream splash with the wordmark; storyboard and webview backgrounds fixed to cream; `ITSAppUsesNonExemptEncryption=false`; `NSCameraUsageDescription`; portrait-only on iPhone. D16, D17, D18.
- **Verified:** PNGs are RGB with no alpha at the required sizes; storyboard and plist parse.
- **NOT verified:** any of it rendered on a device. Needs `npx cap sync ios` and a rebuild.
- **Affects:** slice 8's "no white flash on launch" and "safe areas correct" are both largely done; what remains there is status-bar style, the Android back button and the offline screen.

### Slice 2 remaining

2.6 physical iPhone run (signing Team), plus everything above marked "NOT verified." Then the Android half.

### 2.6 — Physical iPhone run, Google sign-in verified (2026-09-03)

- **Device:** iPhone 16 Pro, signing Team set, Developer Mode on. App installs and runs.
- **Google sign-in through the system browser works end to end on the device** after `af277f8`. The first attempt failed: the custom `/native-auth/callback` page with `<AuthenticateWithRedirectCallback />` came back from Google unable to find the sign-in, bounced to Clerk's hosted Account Portal, and the Account Portal's own Google button then failed with `authorization_invalid`. Google on the website worked in the same Safari, which isolated the fault to that page. Fix: finish OAuth on `/sign-in/sso-callback`, the callback `<SignIn />` already uses, plus `NativeReturnGuard` for any other landing page.
- **Also observed:** the signed-in shortcut in `/native-auth/go` works (a browser that already holds a Spritz session goes straight to the handoff), and the `Open this page in "Spritz"?` prompt is a real one-tap cost on every sign-in. Universal Links would remove it; logged as a revisit, not a blocker.
- **Vercel:** `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up` added so Clerk never falls back to the Account Portal.
- **Lesson:** Clerk's control components assume the sign-in resource is exactly where `<SignIn />` left it. A hand-rolled callback page is not equivalent to the one inside the catch-all route, even with the same props. Reuse the catch-all.
- **Still owed on device:** Sign in with Apple (needs the Clerk connection enabled first), the first-time-Google-account path (sign-up transfer plus the return guard), safe areas and the splash by eye, and a camera scan to confirm the purpose string prompt.
- **Housekeeping:** the Google OAuth client secret was pasted into chat during debugging. Regenerate it in Google Cloud and update Clerk.

## Slice 5 (iOS half) — Push notifications

- **Built:** `e524e0d` plus follow-ups through `3c90032`. Design: `docs/superpowers/specs/2026-09-04-slice-5-push-ios-design.md`. D19 to D23.
- **Verified on the iPhone 16 Pro, 2026-09-05:** app launch registers with APNs and the token lands in `push_tokens`; `npm run push:test` sends a real scan follow-up for the latest matched scan and it arrives on the device (APNs 200, notification delivered). AC 2 and AC 4 met on device.
- **What it took to get there, all environment, none of it the design:**
  - `.env.local` did not exist on the Mac. `vercel env pull` writes `[SENSITIVE]` placeholders for sensitive variables, so the seven values the script needs had to be filled by hand; a second `env pull` wiped them again. Do not run `env pull` on this machine without refilling `APNS_*` and the Supabase pair afterwards.
  - The Supabase project has legacy JWT keys disabled. The service key is `sb_secret_…`, not a JWT. The script now accepts it and refuses `sb_publishable_…`.
  - Two `users` rows share `knightjek23@gmail.com` (two Clerk accounts over time). The script prefers the one with a token.
  - Migrations 0024 to 0027 had been applied by hand and were not in the remote migration history; `db push` re-applied them (all idempotent) and recorded them. 0028 failed on `uuid_generate_v4()`, which is off the CLI's search path on Supabase; switched to `gen_random_uuid()`.
  - The primer never showed because iOS already held the permission from an earlier grant, and the token was only sent on the primer's Yes tap. Fixed: the bridge registers on every launch when permission is granted (`d1f4f9a`).
  - The private key was written into `.env.local` across six lines twice; the script's one-line env reader took only the header. Now one line with literal `\n`, verified with `importPKCS8` before use.
- **Still owed:** AC 5 (tap opens the bottle, `opened_at` set), AC 6 (Account toggle off stops the next send), AC 1 and AC 3 (primer on a fresh install, Not-now cap), AC 7 (dead token disabled; will happen naturally as the stale reinstall token gets rejected), AC 8 (`npm run test:purge`), and the daily cron firing on its own tomorrow at 10:00 Pacific. Foreground banners need the `3c90032` rebuild.
- **Lesson:** every one of tonight's failures was diagnosable from an error the tooling had swallowed: `Tokens: []` hid a missing table, `[SENSITIVE]` looked like a value, a multi-line key looked like a key. The script now surfaces each. Verify the artifact the way the consumer reads it, not the way it was written.

## Slice 6 — Native camera scan

- **Built:** `38cb9a0` plus `dc6018c` (project rename back to App.xcodeproj) and `7faee71` (third plist string). Design: `docs/superpowers/specs/2026-09-05-slice-6-native-camera-design.md`. D24, D25.
- **Verified on the iPhone 16 Pro, 2026-09-06:** shutter opens Apple's camera sheet, the photo scans and lands on the match page. AC 1 met on device.
- **Two things that blocked the first run, both environment:**
  - Xcode had renamed the project to `spritz.xcodeproj`. Capacitor's CLI hardcodes `ios/App/App.xcodeproj`, so `cap sync` failed while writing `Package.swift` and quietly left the camera plugin out of the build. Renamed back. The visible app name comes from `CFBundleDisplayName`, not the project file; keep the project named `App`.
  - `@capacitor/camera` refuses to open the camera unless `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` all exist, even with `saveToGallery: false`. The third was missing; the error surfaced in the app as the generic "Camera blocked" card, with the real reason only in the Xcode console.
- **Still owed:** AC 2 (same bottle via Safari and via the app, compare `scan_events` top-1 and `latency_ms`), AC 3 (native Photos picker), AC 4 (denied path; the `app-settings:` deep link is the one unverified assumption), AC 5 (cancel returns to intro). Screen recording of a native scan for the 4.2 reviewer notes.
- **Affects:** slice 9's privacy declarations now cover camera and photo library access.

## Slice 8 (iOS half) — Native polish

- **Built:** `4482292`. D26 (offline screen), D27 (external links in the in-app browser sheet), D28 (status bar). Safe areas and the launch flash were already done in slice 2 (D13, D16).
- **Verified:** typecheck clean; `public/offline.html` renders headless with zero network requests; `capacitor.config.ts` evaluates with `errorPath`, background and push presentation options.
- **Owed on device:** offline page in airplane mode, Buy tap opens the Safari sheet, status bar dark on cream. Android back button waits for the Android shell.

## Slice 10 — TestFlight build 1

- **Brief:** `docs/superpowers/specs/2026-09-06-slice-10-testflight-design.md` (`2a4bae6`). Started ahead of slice 7 because banking is still pending; build 2 follows purchases.
- **2026-09-06:** archive from `Any iOS Device (arm64)` and upload via Organizer succeeded first time: **App 1.0 (1) uploaded**. Privacy manifest, icon set, entitlements and `ITSAppUsesNonExemptEncryption=false` all passed upload validation.
- **Detour:** the Xcode Cloud onboarding sheet was mistaken for the archive flow; eight cloud builds queued and failed (no Node step, so Capacitor packages in `node_modules` are missing on Apple's runner). Harmless. Local archive is the only pipeline; delete the Xcode Cloud workflow to stop per-push failures.
- **Next:** `APNS_ENV=production` in Vercel before installing from TestFlight; internal tester group; the device checklist in the brief.
- **TestFlight invite:** build 1.0 (1) sat in the internal group as Testing while the tester row read "No Builds Available" and no invite email arrived, with the same Apple ID on the phone and in App Store Connect. Fix: open the build → Test Details → add a note to "What to Test" → Save. That re-synced the build to the group and sent the invite immediately. Remember for build 2: if the invite does not arrive, edit the test notes.
- **Rule for future updates:** web changes deploy through Vercel and appear in the installed app with no new build. A new archive and TestFlight/App Store submission is only needed when the native shell changes: plugins, `Info.plist`, entitlements, `capacitor.config.ts`, icon/splash, version bump, anything under `ios/`.
- **Scroll into empty space (TestFlight build 1):** pulling down at the top of any page revealed a blank cream band above the nav, and the nav rested at two different heights. Website unaffected. Cause: `ios.contentInset: "automatic"` in `capacitor.config.ts`, which adds the status-bar height as a scrollable WKWebView inset on top of the CSS safe-area handling from D13. Set to `"never"`. Native config, so it ships in build 2 (`npx cap sync ios`, archive, upload).

## Post-build-2 feature: keyword search (notes and families)

- **Built 2026-09-07.** Design: `docs/superpowers/specs/2026-09-07-keyword-search-design.md`. Josh chose auto-detect with both sections, and rank-by-matches-then-popularity. Files: `supabase/migrations/0029_search_by_terms.sql`, `lib/search-terms.ts`, `app/api/search/route.ts`, `components/search-autocomplete.tsx`, `app/search/page.tsx`, `lib/supabase/database.types.ts`.
- **Verified:** typecheck clean; the RPC run on a local Postgres 16 against a stub table ("musk, iris, citrus" → 2-of-3 bottle first, then 1-of-3 by popularity; "muskrat wood" excluded by the word boundary; "pink pepper" exact); resolver run against the real editorial and alias data (15 queries: "musk iris citrus", "pink pepper and oud", "agarwood" → oud, "vanila" → vanilla, "citrusy" → Citrus family, "dior sauvage" and "musk, dior" → name search); dropdown rendered headless with two sections and one keyboard list.
- **Owed:** `npm run db:migrate` on the Mac, then a live check on the deployed site.
- **Sign in with Apple wired in Clerk (2026-09-08):** App ID `app.spritzofficial` gained the Sign In with Apple capability; Services ID `app.spritzofficial.signin` (domain `clerk.spritzofficial.app`, return URL `https://clerk.spritzofficial.app/v1/oauth_callback`); a Sign in with Apple key; email sources `clkmail.spritzofficial.app` and Clerk's bounce address. Credentials entered in Clerk's Apple connection (custom credentials, Production instance). **Verified on the TestFlight build 2026-09-08:** Continue with Apple → Apple sheet → back into the app signed in. Closes the slice 2 "Apple enabled in Clerk" item and Guideline 4.8 for submission. Two things learned: the signed-in shortcut in `/native-auth/go` hands back any existing Safari session before the chosen provider runs, so testing a second provider means signing out in Safari first; and the first Clerk error came from a mismatched value on the connection panel (fixed by re-entering).
- **Native Apple sign-in still returned the Google account (2026-09-08):** cause was not Safari. The sign-in sheet (`SFSafariViewController`) keeps its own cookies, so it held the app's earlier Google session and the go page's shortcut reused it. Removed the shortcut (D30 corrected): stale session is signed out, then the tapped provider runs. Workaround until the deploy: delete and reinstall the app.
- **Follow-up (same night):** `clerk.signOut()` with no arguments navigates the sheet to afterSignOutUrl (the landing page) before the provider can start, which is the "irrelevant page" Josh saw in the sheet. Switched to the callback form, which signs out and then runs the provider without navigating. Separately, after the deep link activates the session, `/sign-in` could render for a beat as two native buttons over blank space (Clerk's `<SignIn />` unmounts itself); `NativeSocialButtons` now shows "Signed in" and routes home as a fallback to the bridge's own navigation.

## Slice 2 (Android half) — Capacitor Android shell, verified on device (2026-09-09)

- **Built on the Windows machine** in a fresh clone at `C:\dev\spritz` (not the OneDrive copy: OneDrive plus git/Gradle produced locks and phantom changes earlier). `@capacitor/android@8.5.1`, `npx cap add android`, Android Studio with API 36 SDK. Gradle sync and first install succeeded first time.
- **Manifest edits** (`android/app/src/main/AndroidManifest.xml`): `launchMode` `singleTask` → `singleTop` (RevenueCat's Capacitor docs require `standard` or `singleTop`, or a purchase can be cancelled if the app is backgrounded during verification); added the `VIEW`/`BROWSABLE` intent filter for `@string/custom_url_scheme` (`app.spritzofficial://`) so the native OAuth callback from `lib/native-auth.ts` can reach the app. The template already had `density` in `configChanges`.
- **First launch was a blank cream screen.** Logcat: `Unable to launch app ... SandboxedProcessService0:0: process is bad` and `cr_ChildProcessConn: Failed to establish the service connection`. Android had flagged WebView's sandboxed renderer as a crashing process after the phone's memory manager froze it while the app was foregrounded (`freezing ... sandboxed_process0`), so the WebView painted its background and could never load a page. No web error is logged for this, and `errorPath` never fires. The flag is in-memory; a reboot cleared it and the app rendered. Device is an Emdoor ARKENSTONE (MediaTek); if it recurs after backgrounding, turn off "Suspend execution for cached apps" in Developer options. Not a code problem.
- **Verified on the device, 2026-09-10:** live site renders in the shell; email sign-in completes inside the app; Continue with Google opens the Chrome tab, signs in, and returns to the app signed in through the deep link with `singleTop` (no second app instance); hardware back navigates within the app rather than exiting. Slice 2 acceptance met on both platforms. Slice 8's "Android back button" item closes with it.
- **Tooling notes:** `git status` from the Linux side of the device shell shows ~630 modified files in this clone; that is CRLF on disk seen by a git with no `autocrlf`, not real changes. Windows git is the source of truth for this clone. `adb exec-out screencap -p > file.png` through PowerShell corrupts the PNG (text re-encoding); use `adb shell screencap -p /sdcard/x.png` then `adb pull`.
- **Still owed for Android parity, none of it blocking slice 3:** status bar icons are white on the cream background (slice 8 Android half, needs `StatusBar.setStyle` dark on Android or `windowLightStatusBar` in the theme); Android push (FCM, slice 5 half); native camera on Android (slice 6 half); offline page in airplane mode.
- **Next:** slice 3. Sign a release AAB, upload to a closed track, invite 14+ testers, record day 1 of 14.

## Cross-platform rules from here (2026-09-10)

- Two native shells now share `capacitor.config.ts`. Any change to it, or a plugin add/upgrade, needs `npx cap sync ios` on the Mac **and** `npx cap sync android` on the Windows clone (`C:\dev\spritz`), each followed by that platform's rebuild. Web changes still deploy via Vercel with no sync on either side.
- iOS-only keys (`ios.contentInset`) and Android-only files (`android/`) are ignored by the other platform's sync; no coordination needed for those beyond pulling.
- The Mac clone is the place for web and iOS work; the Windows clone for Android. Both push to `main`; pull before starting on either machine.

## Slice 7 (iOS) — Native purchases

- **Built 2026-09-11.** Design: `docs/superpowers/specs/2026-09-11-slice-7-purchases-design.md`. D31–D33. Apple banking read Clear the same day.
- **Verified before push:** typecheck clean; `lib/native/purchases.ts` exercised against a stubbed SDK (configure / user switch / logout, store-priced plans with the trial read from the intro offer, purchase → sync, cancel, purchase-without-entitlement error, empty offerings → unavailable, restore → sync).
- **Owed:** migration 0030; App Store Connect products; RevenueCat project + webhook; three Vercel env vars; In-App Purchase capability; build 3; sandbox run through the acceptance criteria; App Privacy purchase-history row; reviewer-notes purchases line.
- **App Store Connect products configured 2026-09-11** (browser pane, Josh clicking every Save/Confirm): subscription group **Spritz Pro** (id 22375859, display name "Spritz Pro", app name default) with `spritz_pro_monthly` (Apple ID 6810945694, 1 month, $4.99 USD, all 175 territories, introductory offer **free for 1 week**, no end date, level 1) and `spritz_pro_annual` (Apple ID 6810954866, 1 year upfront, $29.99 USD, all territories, no offer, level 2); non-consumable `spritz_pro_lifetime` (Apple ID 6810956386, $89.00 USD from the extended price list, all territories). All three are Prepare for Submission. Description copy is capped at 55 characters. Note: the confirm sheet showed the lifetime price "ending on Sep 14" — that is Apple's scheduling display for a brand-new price, not a real expiry; check it reads as the current price once approved.
- **Still owed on Apple's side before "Add for Review":** one review screenshot per product (a device screenshot of the native purchase sheet from build 3), then attach all three products to the 1.0 version in the App Store tab, since a first subscription/non-consumable must ship with a new app version.
- **RevenueCat configured 2026-09-11** (project `3259b09f`, app "Spritz iOS" `appeb75b03321`, bundle `app.spritzofficial`, In-App Purchase key `K54YY2SRNV` uploaded and validated). Products `spritz_pro_monthly`, `spritz_pro_annual` (subscriptions) and `spritz_pro_lifetime` (non-consumable). Entitlement **`pro`** created with all three App Store products attached (the onboarding wizard's `spritz_pro` entitlement and `default` offering exist too; `spritz_pro` only holds Test Store products and can be ignored). Offering `default` packages `$rc_monthly` / `$rc_annual` / `$rc_lifetime` each mapped to the matching Spritz iOS product; `lib/native/purchases.ts` already accepts `$rc_lifetime`, so no custom `lifetime` package. Webhook "Spritz entitlement sync" → `https://spritzofficial.app/api/webhooks/revenuecat`, both environments, all events, Authorization value generated (in Josh's hands, not in the repo). Secret API key "Vercel purchases sync" (V1) generated. Apple Server Notification URL from RevenueCat: `https://api.revenuecat.com/v1/incoming-webhooks/apple-server-to-server-notification/xVrDkDPNIkDBTlfdjNDYyMibEvfDbjhU` — optional, paste into App Store Connect → App Information → App Store Server Notifications (production + sandbox) when convenient.
- **Paused here.** Next on resume: confirm the three Vercel env vars (`REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `NEXT_PUBLIC_REVENUECAT_IOS_KEY` = Spritz iOS `appl_` key, not the Test Store key) and a redeploy; then `npm install && npx cap sync ios`, In-App Purchase capability in Xcode, build 3, sandbox tester, the acceptance run, review screenshots on the three products, App Privacy purchase-history row, reviewer notes.
- **Sandbox acceptance, monthly (2026-09-12, build 3 via TestFlight):** first attempt showed "Purchases aren't available right now" because the phone was still on build 2 (no RevenueCat plugin → configure fails silently → `unavailable`). On build 3 the TestFlight store sheet showed "Spritz Pro Monthly", "1-week free trial", "$4.99 per month starting Sep 19", "For testing purposes only" (TestFlight builds say this instead of `[Environment: Sandbox]`, and use the real Apple ID; the sandbox tester account only matters for Xcode-installed builds). Subscribe → "You're all set" → app landed on the collection upgraded; Account shows Pro with Manage subscription; pricing page shows Monthly as current. RevenueCat: customer = Clerk user id, "Started a trial of Spritz Pro Monthly from offering default", entitlement Pro active trial. Webhook event 88ca3e70 **Sent** at 18:33 UTC, so the Authorization value matches and the grant ran. Vercel env vars: `NEXT_PUBLIC_REVENUECAT_IOS_KEY` had to be set to visibility "Config" (Vercel refuses "secret" on a public-prefix var). Xcode Cloud build 26 failed on the push as usual; workflow still to be deleted.
- **Still to run:** Restore purchases after sign-out/sign-in; sandbox expiry (trial converts in ~1 day in sandbox time, then 5-minute renewals, lapses after 6) → Account back to Free via the EXPIRATION webhook; lifetime purchase on a second throwaway account (exercises the non-consumable grant with `is_lifetime`); annual optional. Then review screenshots on the three products, App Privacy purchase-history row, reviewer notes, attach products to version 1.0.
- **Restore verified (2026-09-12):** signing out and back in shows Pro straight from Supabase (no Restore link, by design per D33). Simulated the "DB doesn't know" case with `update users set plan='free' where clerk_user_id=…`; Account then showed Free plus Restore purchases; tapping it flipped back to Pro immediately via `/api/purchases/sync`.
- **Lifetime + TRANSFER verified (2026-09-12):** second throwaway account bought `spritz_pro_lifetime` ($89 sandbox) → RevenueCat "Pro: Active · unlimited duration", Account shows Pro with no Manage button. Because both Spritz accounts share one Apple ID, RevenueCat transferred the monthly trial to the second account and sent a TRANSFER event; both webhook events Sent; the first account dropped to Free as the handler intends. Expiry not separately tested (same revoke path); optional later with a third account.
- **Slice 7 acceptance met.** Remaining before submission: review screenshot per product, App Privacy purchase-history row, reviewer notes, attach the three products to version 1.0, delete the Xcode Cloud workflow.
- **Review screenshots + App Privacy (2026-09-13):** per-product review screenshots (pricing page with the plan selected, 1206×2622, in `docs/build/review-screenshots/`) uploaded to all three products; App Store Connect stores them on upload, the page Save button stays grey. App Privacy questionnaire filled for the first time (slice 9 only drafted the answers): Yes we collect; Name, Email, Photos or Videos, Other User Content, User ID, Device ID, Purchase History → App Functionality (Device ID also Analytics), all linked to identity, none for tracking; Product Interaction → Analytics, not linked, not tracking. User ID added beyond the slice 9 table because the Clerk user id is sent to RevenueCat as the app user id. Preview shows Data Linked to You + Data Not Linked to You, no tracking section. Privacy Policy URL set to https://spritzofficial.app/legal/privacy. Not yet published: the App Privacy "Publish" button is Josh's click.
- **Reviewer info (2026-09-13):** demo account created as a Free account with a populated shelf (decision: free rather than the slice 9 plan of Pro, so App Review can exercise the purchase itself); credentials, contact info and the reviewer notes (scan flow, native features, purchases paragraph, demo account) saved on the 1.0 version under App Review Information. Products are no longer attached on the version page; they join the version in the Add for Review submission panel at slice 11. Version still has no build selected and release type is "automatically after review"; both to settle at submission.
- **Slice 10 checklist, item 4 (email sign-in) 2026-09-13:** the bottle loader that replaced Clerk's spinner overlapped the "Continue" label, because Clerk also renders `.cl-spinner` inside the submit button (in place of the arrow) and the 28×40 override does not fit a 36px button; on the emerald button it was invisible as well. Fix in `app/globals.css`: button-scoped variants (17×24, heavier strokes so they survive the size, paper strokes on `.cl-formButtonPrimary`). Web change, no build. Verified against a mock of Clerk's button in headless Chromium; recheck live on the phone after deploy.

## Slice 3 — Android closed test (2026-09-10 to 2026-09-13)

- **Build:** upload keystore `C:\dev\keys\spritz-upload.jks` (alias `spritz-upload`, passwords in Josh's password manager, outside the repo), Play App Signing on. Release AAB `1 (1.0)` from Android Studio's Generate Signed App Bundle; the first attempt used Build App Bundle(s), which produces an unsigned debug bundle Play rejects. Android launcher icons, cream splash and the 512 Play icon were generated from the iOS icon first so testers never see Capacitor's default.
- **Play Console:** app created (package `app.spritzofficial`, `Spritz: Fragrance Guide`, Free, category Beauty per D34). All 13 setup tasks done: privacy policy, app access (reviewer credentials), no ads, IARC rating (Everyone), 18+ target audience, Data Safety mirroring the Apple label (name, email, photos, app interactions, user content, device IDs; nothing shared), no government/financial/health features, contact details, store listing (Play copy in `store-listing-copy.md`), merchant profile ("Spritz" as the card-statement name), price Free. Gotchas: the IARC questionnaire's Next button stays disabled until the answers are saved via the overflow menu at narrow widths; "Your app cannot be published yet" on the release page meant the pricing task, which the dashboard did not flag as blocking.
- **Track:** "Spritz closed test", release live 2026-09-10 8:28 PM, 177 countries, feedback address `josh.knight@spritzofficial.online`. Opt-in link `https://play.google.com/apps/testing/app.spritzofficial`.
- **Testers (Tier 1):** Josh chose Testers Community's free exchange over paid pools and over recruiting; faking accounts was ruled out (policy violation, account termination). Mechanism is their Google Group `testers-community@googlegroups.com` on the track; Josh is a member (joined Sep 10), so his own Gmail is covered by it.
- **Gotcha that cost two days:** Play's Testers tab is a radio between Email lists and Google Groups. Creating an email list for Josh's own address silently dropped the group, so no Testers Community member could opt in and they emailed that the app was inaccessible. Group re-added 2026-09-13, sent for review. Rule: one Google Group field, several addresses; never an email list on this track.
- **Clock:** day 1 of 14 is the day the dashboard shows 12 testers opted in. Not reached as of 2026-09-15.

## Android push crash and hotfix (2026-09-13 to 2026-09-15)

- **Found** while testing the camera on the Android phone: `FATAL EXCEPTION: CapacitorPlugins … Default FirebaseApp is not initialized in this process app.spritzofficial` from `PushNotificationsPlugin.register`. The scan result showed the primer, Yes granted the permission, `register()` hit Firebase Messaging with no Firebase in the Android project, and the app died; the bridge's register-on-launch then repeated it on every launch ("Spritz keeps stopping"). On Android 12 and older the permission is granted by default, so the closed-test build would have crashed on first launch for those testers.
- **Unstuck the phone:** `adb shell pm clear app.spritzofficial` plus `pm revoke … POST_NOTIFICATIONS`.
- **Hotfix `e2b35f8`, web-side, so every installed copy picked it up through Vercel with no new AAB:** `isPushSupported()` in `lib/push.ts` (native and iOS only, comment names the crash), used by `getPushPermission`, `requestPushAndRegister`, the bridge's push effect and the Account toggle. Primer hides on "unavailable" already. Typechecked against a fresh clone of `main` before it was written into the Windows clone.
- **Lesson:** the remote-load shell means a native crash whose trigger is JavaScript can be fixed for the installed base in minutes. It also means anything the web calls into a plugin must be gated per platform until that platform's native side exists.
- **Next:** Android update 1 (`docs/superpowers/specs/2026-09-15-android-update-1-design.md`, D35, D36): real FCM push, camera denied path, status bar and offline checks, shipped as `versionCode 2` on the closed track.

## Android update 1 ships, second push crash, build-number gate (2026-09-17 to 2026-09-18)

- **versionCode 2 uploaded to the closed track 2026-09-18** (Generate Signed App Bundle; the first upload attempt was the Sep 10 file, which Play refuses because version code 1 already exists). Three warnings, none blocking: the advertising ID declaration had been answered Yes on Sep 10 while the manifest has no AD_ID permission (Spritz uses no advertising ID; fix is the declaration, set to No), plus the usual deobfuscation-file and native-symbols recommendations, ignored for a Capacitor release build.
- **Android push round trip verified 2026-09-18:** `npm run push:test -- --email` on the Mac → `sent: 1` over FCM → notification on the Android phone with the S glyph and green accent → tap opened the fragrance page. Slice 5 Android acceptance criteria 1 and 2 met. Setup gotchas: `.env.local` needs `APNS_ENV=production` now that the iPhone runs TestFlight (the leftover `sandbox` produced `BadDeviceToken` and disabled the live iOS token; reopening the iPhone app re-registers it), and zsh's `echo` rewrites the `\n` escapes inside the service-account private key, so `FCM_SERVICE_ACCOUNT_JSON` is written with Node's `JSON.stringify`, never `echo`.
- **Second push crash, same exception, 2026-09-18:** enabling notifications on the phone killed the app again. Cause: the phone still ran version code 1 (no Firebase) while the site had lifted the iOS-only gate on Sep 15, ahead of any v2 rollout. Every closed tester on v1 was exposed the same way. The platform gate was the wrong shape: the remote-load shell serves one site to every installed build, so a gate on a native capability has to read the build number of the shell it is in.
- **Hotfix, web-side:** `lib/push.ts` gains `ANDROID_MIN_PUSH_BUILD = 2` and `resolvePushSupport()`, which reads `App.getInfo().build` on Android once and caches it; `getPushPermission`, `requestPushAndRegister`, the bridge's push effect and the Account toggle all await it before touching the plugin. v1 installs behave exactly as under `e2b35f8` (no primer, no toggle) and the gate opens per phone as Play delivers v2. Typechecked; no native change.
- **Rule going forward:** any web call into a Capacitor plugin that a shipped build lacks is gated on `App.getInfo().build`, not on platform. The build number is the only thing the site can trust about what is installed.
- **Still owed on Android:** acceptance criteria 3 (Android 12 emulator: no crash, no token before Yes), 4 (toggle off clears the flag), 5 (camera denied path), status-bar screenshots and the offline page. Production-access answers drafted in `docs/build/play-production-access-answers.md`.

## Slice 11 — App Store submission (2026-09-15)

- **Submitted 1.0 (3) to App Review 2026-09-15 ~9:25 PM PT** with the Spritz Pro subscription group, `spritz_pro_monthly`, `spritz_pro_annual` and `spritz_pro_lifetime` in one submission; all show Waiting for Review. Release type Manual.
- **Pre-submit blockers found by Add for Review:** Content Rights (set to no third-party content), copyright (`2026 Josh Knight`), and a price tier (Free). Fixed on the App Information and Pricing pages.
- **First attempt went out without the products.** The version-only submission had to be pulled with "remove this version from review" (Apple labels that "Developer Rejected"; it is not an Apple rejection), then Add for Review on the version, both subscriptions, the lifetime product **and the subscription group** itself, which is its own reviewable item the first time. Lifetime's availability had also reverted to unset and needed re-selecting plus a page Save before it would join.
- **Store listing at submission:** 3 App Previews + 8 screenshots (6.5" set), reviewer notes with the Free demo account, no review attachment (previews cover it; `docs/build/review-video/spritz-reviewer-walkthrough.mp4` is the 6.5 MB H.264 version of Josh's 1:54 walkthrough if Apple asks for one).
- **Slice 10 device checklist:** run by Josh on build 3; the one finding was the Clerk button spinner overlap, fixed web-side 2026-09-13. Everything else reported passing.
- **Waiting on Apple.** When it flips to Pending Developer Release: enrol in the Small Business Program before releasing, then Release This Version. If it comes back with a rejection, paste the Resolution Center message here.
- **Rejected 2026-09-16 00:27, Guideline 3.1.2 (automated metadata check):** no Terms of Use (EULA) link on the product page. Fix: App Description now ends with a subscription-terms paragraph plus `Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` and the privacy URL; version marked Update Review and the same five-item submission resubmitted. Also added the in-app half of 3.1.2 to `/pricing` (renewal terms line with Terms of Use and Privacy Policy links under the plan card, Apple EULA in the store build, `/legal/terms` on the web) so the human reviewer has nothing to bounce on. Web change, no build.
- **Rejected 2026-09-18 10:17, Guideline 2.1(a) App Completeness / Information Needed (human review, iPad Air 11" M3):** the reviewer's screenshot shows Clerk's "Check your email" new-device code prompt for the demo account. Root cause: Clerk Production → Protect → Rules → **Device Trust** ("treating new devices as untrusted for password sign-ins") was Enabled, so any password sign-in from a device Clerk had never seen demanded an email code the reviewer cannot read. Fix: Device Trust disabled in the Clerk dashboard (no code change; Lockout, Bot sign-up protection and User enumeration protection stay on), reviewer notes gained a paragraph stating sign-in is email + password only with no verification code, version Saved → Update Review → resubmitted 2026-09-18. Lesson: any auth step that depends on the reviewer's inbox, phone or a known device is a 2.1(a) rejection waiting to happen; test the demo account from a device that has never signed in before every submission.
- **Approved and released 2026-09-22.** Third submission (after the 3.1.2 and 2.1(a) fixes) came back Pending Developer Release; Josh clicked Release This Version the same day. Slice 11 closed. iOS is live as "Spritz: Fragrance Guide" 1.0 (3), Free with Spritz Pro monthly / annual / lifetime IAPs. Small Business Program enrollment submitted 2026-09-18 (individual account, no associated accounts).
- **Post-release checklist:** install from the App Store (not TestFlight), sign in, one scan, one real monthly-trial purchase to confirm production StoreKit + RevenueCat webhook, then cancel in Settings → Subscriptions; re-enable Clerk Device Trust once review-era demo sign-ins are no longer needed (or leave it off and keep the demo account for future reviews); paste the RevenueCat Apple Server Notification URL into ASC (optional); resolve the pricing-page vs Account plan-source mismatch.
- **Operating rule now that it's live:** web changes ship via Vercel to every installed copy with no review; only native changes (plugins, Info.plist, capacitor.config, ios/) need a new build + submission. Gate any web call into a plugin on the shell build number.
