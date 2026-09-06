# Slice 10 — TestFlight build 1 and device verification (iOS)

**Status:** brief. No code changes; one Vercel env change and a set of steps Josh runs.
**Why now:** slice 7 is gated on Apple's bank status. Build 1 proves the archive/upload pipeline and gives a TestFlight install to verify slices 2 through 8 against. Build 2 follows slice 7 with purchases.
**Tier 1 decisions:** none (map says none expected). One Tier 2 below.

## Tier 2: APNs environment flips to production

`lib/apns.ts` sends to one host chosen by `APNS_ENV`. A TestFlight install registers a *production* token; sending it to the sandbox host returns `BadDeviceToken` and the token is disabled. So before installing from TestFlight, set `APNS_ENV=production` in Vercel (Production environment) and redeploy. After that, Xcode-installed debug builds no longer receive push (their sandbox tokens fail against the production host, which also exercises the dead-token path, AC 7). That is the right default from here to launch. Per-token environment is a revisit if dev-build push is ever needed again.

The `aps-environment` entitlement stays `development` in the repo; Xcode rewrites it to `production` when exporting for App Store Connect under automatic signing.

## Build 1 steps (Xcode)

1. `cd ~/Projects/spritz && npm install && npx cap sync ios` so the status-bar plugin from slice 8 is in the project.
2. Xcode → the destination pill (currently "Josh's iPhone") → choose **Any iOS Device (arm64)**. Archive is disabled for a simulator destination.
3. Menu **Product → Archive**. Two to five minutes. The Organizer window opens on the archive when it finishes.
4. Organizer → **Distribute App** → **TestFlight & App Store** → Upload. Accept the defaults (upload symbols, manage version and build number). Automatic signing creates the distribution certificate and profile on first use.
5. App Store Connect → Spritz → **TestFlight** tab. The build shows "Processing" for 10 to 30 minutes, then either "Ready to Test" or a Missing Compliance prompt (should not appear: `ITSAppUsesNonExemptEncryption` is false in Info.plist).
6. TestFlight → Internal Testing → **+** → create group "Spritz internal", add yourself, enable the build. Install the TestFlight app on the iPhone, accept the invite, install.

If Apple emails an "ITMS" warning after upload, paste it here; the likely ones are a missing privacy manifest reason (would mean the pbxproj edit did not copy the manifest) or an icon issue.

## Device verification checklist (evidence per line, screen recording or screenshot)

Run on the TestFlight install, not the Xcode build, so what is verified is what ships.

**Slice 2 (shell)** — launches to the live site, Google sign-in completes, icon and splash correct. Sign in with Apple: still needs the Clerk connection enabled; verify or log as owed.
**Slice 5 (push)** — fresh install shows the primer on the first scan result (AC 1); Not-now cap (AC 3); `npm run push:test -- --email knightjek23@gmail.com` arrives; tap opens the bottle and `opened_at` is set (AC 5); Account toggle off stops the next send (AC 6); `npm run test:purge` passes (AC 8). Cron fires on its own at 10:00 Pacific (check `push_sends` the next morning).
**Slice 6 (camera)** — same bottle via Safari and via the app, compare `scan_events` top-1 and `latency_ms` (AC 2); Photos picker (AC 3); deny camera, confirm the "Open Settings" link lands in the app's Settings page (AC 4, the one unverified assumption); cancel returns to intro (AC 5).
**Slice 8 (polish)** — airplane mode shows the offline page and Try again recovers; Buy opens the Safari sheet; status bar readable on cream.

**Reviewer video (for slice 11 notes):** one continuous recording of a native scan, the push primer, and a push arriving and opening the bottle. IAP is added to the recording after slice 7.

## Exit criteria for build 1

Build installed from TestFlight, every line above has evidence or an explicit owed entry in the build log, and the reviewer video (minus IAP) exists.
