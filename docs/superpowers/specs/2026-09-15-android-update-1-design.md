# Android update 1 — push over FCM, camera denied path, status bar, offline

**Status:** approved by Josh 2026-09-15 (push transport and denied path). Status bar and offline page wait for device evidence before any code.
**Decisions:** D34 (Play category, carried from slice 3), D35 (Android push: FCM direct from Vercel), D36 (Android camera denied path).
**Ships as:** the Android halves of slices 5, 6 and 8 in one closed-testing release, versionCode 2. A mid-test upload does not reset any tester's 14 days.
**Depends on:** the iOS-only push gate (`isPushSupported()`, commit `e2b35f8`), which this update lifts.

## Why this exists

The closed-test build crashed the moment push was touched on Android: `PushNotifications.register()` asks Firebase Messaging for a token, the Android project has no Firebase, and the plugin throws `Default FirebaseApp is not initialized`, which Android treats as fatal. On Android 13+ that happened after the primer's Yes; on Android 12 and older, where the notification permission is granted by default, it would have happened on first launch before the page painted. The web-side gate stopped the bleeding for every installed copy. This update gives Android real push instead of a gate, and clears the two other Android gaps found in slice 2 testing.

## D35 — Android push: FCM HTTP v1 direct from Vercel

Mirror of D19. No vendor, no SDK beyond Firebase Messaging, which the Capacitor plugin requires on Android anyway. Nothing new on either privacy declaration: Device ID is already declared on both stores and FCM tokens are device identifiers.

### Firebase (Josh, in the console)

1. console.firebase.google.com → Add project → name `Spritz` → Google Analytics **off** (not needed; keeps the Firebase SDK footprint to Messaging only) → Create.
2. Add app → Android → package `app.spritzofficial`, nickname `Spritz Android`, SHA-1 blank (only needed for Google sign-in through Firebase, which Spritz does not use) → Register → download `google-services.json` → save as `C:\dev\spritz\android\app\google-services.json`. Skip the "Add Firebase SDK" steps; Capacitor's `android/app/build.gradle` already applies the `google-services` plugin when that file exists.
3. Project settings → Cloud Messaging → confirm **Firebase Cloud Messaging API (V1)** is enabled (the legacy API is retired and stays off).
4. Project settings → Service accounts → **Generate new private key** → a JSON file downloads. This is a server credential: never committed, never in the Android app. It goes into Vercel as `FCM_SERVICE_ACCOUNT_JSON` (Sensitive, Production and Preview), the whole file on one line, and into `.env.local` on the Mac for `npm run push:test`.

`google-services.json` is committed with `android/`; it holds the project id and a client API key that Google scopes to the Android app, which is the normal arrangement.

### Server

- **`lib/fcm.ts`** (new, `server-only`). Reads `FCM_SERVICE_ACCOUNT_JSON`, mints a Google OAuth access token by signing a JWT with the service-account key (`jose`, RS256; `iss` = `client_email`, `scope` = `https://www.googleapis.com/auth/firebase.messaging`, `aud` = `https://oauth2.googleapis.com/token`, 1 hour) and exchanging it at the token endpoint. Cached for 50 minutes, same policy as the APNs JWT. `sendFcm(token, payload)` POSTs to `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` with:

  ```json
  {
    "message": {
      "token": "<device token>",
      "notification": { "title": "...", "body": "..." },
      "data": { "path": "/fragrance/<id>", "sendId": "<push_sends.id>" },
      "android": {
        "priority": "HIGH",
        "notification": { "channel_id": "spritz_followups", "icon": "ic_stat_spritz", "color": "#1F3F2E" }
      }
    }
  }
  ```

  Result mapping: HTTP 200 → sent. `UNREGISTERED` (404) or `INVALID_ARGUMENT` on the token (400) → token is dead, disable it, same as APNs 410 / `BadDeviceToken`. 429 and 5xx → transient, recorded, not disabled. Returns `{ ok, status, reason }` in the same shape as `sendApns` so the campaign treats both alike.

- **`lib/push-scan-followup.ts`**: the token loop branches on `platform`: `ios` → `sendApns`, `android` → `sendFcm`. The `platform !== "ios"` skip is removed. `push_sends.apns_status` / `apns_reason` hold the FCM HTTP status and error code for Android rows; the column names stay (a rename is a migration for no behaviour change; the `token_id → platform` join says which provider a row came from).
- **`scripts/push-test.ts`**: unchanged in shape; it already goes through the campaign, so `npm run push:test -- --email` reaches an Android token once the branch exists.
- **`app/api/push/register/route.ts`**: unchanged. It already accepts `platform: "android"` and the `TOKEN_PATTERN` (32 to 512 of `[A-Za-z0-9_:-]`) covers FCM tokens, which are ~160 characters with `:` and `-`.

### Client

- **`lib/push.ts`**: `isPushSupported()` becomes `isNativeApp()` (both platforms). New `ensureAndroidChannel()`: on Android only, `PushNotifications.createChannel({ id: "spritz_followups", name: "Scan follow-ups", description: "One notification the day after a scan, with how it wears.", importance: 4, visibility: 1 })`. Idempotent; called before every `register()`. Without a channel Android files the notification under "Miscellaneous" and the person cannot manage it separately.
- **Consent on Android 12 and older (D21 holds).** There is no OS permission there, so `checkPermissions()` reports granted on first launch and the bridge's register-on-launch would enrol people who never saw the primer. Fix: `requestPushAndRegister()` (the primer's Yes) writes a local flag `spritz:push:opted-in`; on Android, register-on-launch requires that flag as well as `granted`. On iOS the OS permission already is the flag, and the behaviour there does not change. `disablePush()` clears the flag so a later re-enable goes back through a Yes.
- **`components/native-auth-bridge.tsx`**: the push effect's `isPushSupported()` gate now admits Android; the register-on-launch block calls `ensureAndroidChannel()` first and honours the opt-in flag rule above. The three listeners (`registration`, `registrationError`, `pushNotificationActionPerformed`) are platform-neutral already.
- **`components/push-primer.tsx`**, **`components/push-settings.tsx`**: no change; both read `getPushPermission()`, which now works on Android. On Android 13+ the primer's Yes shows the system POST_NOTIFICATIONS prompt (the plugin's `requestPermissions()`); on 12 and older it resolves granted at once and registers.

### Android project

- `android/app/google-services.json` (from Firebase).
- `AndroidManifest.xml`: `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (declared explicitly rather than relying on the plugin's merged manifest), plus two `<meta-data>` entries inside `<application>`: `com.google.firebase.messaging.default_notification_icon` → `@drawable/ic_stat_spritz` and `com.google.firebase.messaging.default_notification_color` → `@color/ic_launcher_background` (the brand green). Without the icon Android renders the launcher icon as a white square in the status bar.
- `res/drawable-*/ic_stat_spritz.png`: white-on-transparent silhouette of the S mark at 24dp (mdpi 24 … xxxhdpi 96), generated from the 1024 icon.
- `android/app/build.gradle`: `versionCode 2`. `versionName` stays `1.0`.

## D36 — Android camera denied path: instruction, no settings deep link

`app-settings:` is an iOS scheme; on Android `window.location.href = "app-settings:"` does nothing. Options were a community plugin to open the app's settings page, or an instruction line. Choice: the instruction. On Android the camera plugin hands off to the system camera app, so a denied-camera state is rare, and a plugin for a rare path is not worth the dependency. `openAppSettings()` becomes a no-op on Android and `camera-capture.tsx` hides the "Open Settings" button there, keeping "Choose from Photos" and a platform-specific path line: iOS "Settings › Spritz › Camera", Android "Settings › Apps › Spritz › Permissions › Camera".

## Waiting on evidence (no code until then)

- **Status bar (slice 8, D28 on Android).** The bridge already calls `StatusBar.setStyle(Style.Light)` on both platforms. What is unknown on Android 15+ with targetSdk 36 (edge-to-edge is forced): whether the WebView reports the safe-area inset so D13's tokens push content below the bar, and whether the bar's glyphs are dark once the page has loaded. Two screenshots from the phone settle it. If content sits under the bar the fix is web-side (the D13 tokens read `env(safe-area-inset-top)`, which Android WebView exposes under edge-to-edge); if not, `StatusBar.setOverlaysWebView({ overlay: false })` on Android is the fallback.
- **Offline page (slice 8, D26).** `server.errorPath` is documented for Android too, but unverified here. Airplane mode, force-close, reopen: expect the cream Spritz screen with Try again.

## Acceptance criteria

1. **Given** the Android 14 phone on the update, **when** a first scan matches, **then** the primer appears; Yes shows the system notification prompt; Allow produces a `push_tokens` row with `platform = 'android'` for the signed-in user.
2. **Given** that row, **when** `npm run push:test -- --email <that account>` runs, **then** the notification arrives on the phone with the Spritz icon and green accent, under the "Scan follow-ups" channel in the app's notification settings; a tap opens the app on `/fragrance/<id>` and `push_sends.opened_at` is set.
3. **Given** an Android 12 emulator (API 31) with a fresh install, **when** the app launches, **then** it does not crash and no token is registered until the primer's Yes; after Yes, a token is registered without any system prompt.
4. **Given** the Account toggle on Android, **when** it is turned off, **then** the server row is disabled, the local opt-in flag is cleared, and relaunching does not re-register.
5. **Given** camera permission denied on Android, **when** the denied card renders, **then** it shows "Choose from Photos" and the Android settings path, with no "Open Settings" button and no dead link.
6. **Given** the iPhone build, **when** `npm run push:test` runs for an iOS account, **then** it still delivers (the shared campaign loop did not regress iOS).
7. Status bar and offline: criteria written once the evidence is in.
8. Release: `versionCode 2` AAB uploaded to the closed track, live, installed from Play on the phone; the closed-test tester count is unchanged by the upload.

## Owed after this

- Firebase's Analytics stays off; if it is ever turned on, both privacy declarations gain rows.
- `push_sends` column rename (`apns_*` → `provider_*`) if the schema is touched for another reason.
- Slice 9 Android: Play Data Safety is already correct for this (Device IDs, App interactions); re-check after any further SDK.
