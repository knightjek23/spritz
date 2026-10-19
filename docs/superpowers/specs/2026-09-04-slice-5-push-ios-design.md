# Slice 5 (iOS half) — Push notifications, end to end

**Status:** awaiting Josh's approval
**Decisions:** D19 (send architecture), D20 (first campaign), D21 (primer moment), D22 (primer copy), all 2026-09-04. Deep-link target and frequency cap are proposed below for confirmation.
**Depends on:** slice 2 iOS (done). The Android half waits for the Android shell and reuses everything server-side.

## What this does

Gives the native app the one thing the PWA cannot do and the reason D1 chose to go native: a way back in. A person scans a bottle; the next day the app tells them how it wears and what to compare it to, and a tap lands on that bottle's page. Everything else in this slice exists to make that one message deliverable, wanted, and measurable.

Done means, on a real iPhone: the primer appears on the first scan result; Yes triggers the OS prompt; the token lands in Supabase against the Clerk user; the daily job sends a follow-up for yesterday's scan; the notification arrives, and tapping it opens the fragrance page inside the app; Account has a toggle that turns it off and the next run skips that user.

## Decisions already made

- **D19, sending:** direct to APNs from a Vercel route over HTTP/2 with a token-signed JWT. Client is `@capacitor/push-notifications` only. Nothing new on the privacy label.
- **D20, first campaign:** scan follow-up, sent the day after a scan that produced a match. Transactional, one per scan.
- **D21, primer moment:** inline card on the scan receipt, first native scan with a match. "Not now" re-offers on later scans up to a cap, then stops. Never on the web.
- **D22, primer copy:** title "Want a follow-up on {fragrance} tomorrow?", body "One notification, the day after each scan, with how it wears and what to compare it to.", buttons "Yes, notify me" / "Not now".

## Proposed, confirm or change

- **Deep-link target:** `/fragrance/{id}` of the scanned bottle. The notification payload carries the path; the bridge navigates to it when the tap wakes the app. Tier 2 given D20, but listed because the map called it out.
- **Frequency cap:** at most one push per user per day. If someone scanned three bottles yesterday they get one notification, for the most recent match, not three. Nothing for scans older than 48 hours, so a job that missed a day does not send a stale batch. The job runs once daily at 10:00 Pacific (17:00 UTC), a time people are awake and not in the morning rush. No send if the user has no enabled token.
- **"Not now" cap:** the primer re-offers on the next scan, at most three times total, then never again. Stored client-side. A person who has said no three times has answered.
- **Copy of the notification itself:** title "{Fragrance} by {House}", body "Here's how it wears, and what to compare it to." Short enough for the lock screen. The page does the talking.

## Data

New migration `0028_push.sql`:

```sql
create table public.push_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android')),
  enabled     boolean not null default true,
  created_at  timestamptz default now(),
  last_seen   timestamptz default now(),
  unique (token)
);
create index push_tokens_user_idx on public.push_tokens (user_id) where enabled;

create table public.push_sends (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  token_id      uuid references public.push_tokens(id) on delete set null,
  campaign      text not null,            -- 'scan_followup'
  fragrance_id  uuid references public.fragrances(id) on delete set null,
  scan_event_id uuid references public.scan_events(id) on delete set null,
  sent_at       timestamptz default now(),
  apns_status   int,
  apns_reason   text,
  opened_at     timestamptz
);
create index push_sends_user_day_idx on public.push_sends (user_id, sent_at desc);
```

`push_sends` is what makes the frequency cap and the "push → session" metric real: the cap reads it, the open handler writes `opened_at` to it. Both tables are covered by `purgeAppUserData` (account deletion) through the `on delete cascade`; the purge test gets two new assertions.

## Server

- `lib/apns.ts`: builds the provider JWT (`jose`, already installed at 5.10.0, ES256 with the .p8 key), holds one HTTP/2 session to `api.push.apple.com`, sends one notification, returns status and reason. 410 or `BadDeviceToken` disables the token. Env: `APNS_KEY_ID`, `APNS_TEAM_ID` (58K78KQ5TE), `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID` (app.spritzofficial), `APNS_ENV` (`sandbox` for Xcode builds, `production` for TestFlight and the store).
- `app/api/push/register/route.ts`: POST, Clerk-authenticated, upserts the token for the user. DELETE disables it. This is what the toggle calls.
- `app/api/push/opened/route.ts`: POST from the bridge with the `push_sends` id from the payload; stamps `opened_at`.
- `app/api/cron/push-scan-followup/route.ts`: guarded by `CRON_SECRET` (Vercel sends it as a bearer token). Selects scans from the previous day with a match and an enabled token, one per user, skips users with a send in the last 24h, sends, logs. Idempotent: a second run the same day sends nothing.
- `vercel.json`: one cron entry, `0 17 * * *`.
- `scripts/push-test.ts`, `npm run push:test -- --email you@example.com`: sends a real follow-up for that user's latest scan, right now, so the round trip can be shown working without waiting for tomorrow.

## Client

- `@capacitor/push-notifications` in `package.json`; `npx cap sync ios`. In Xcode: the Push Notifications capability on the App target (one click, it registers the entitlement with Apple). `AppDelegate.swift` gets the two token-forwarding methods the plugin needs.
- `lib/push.ts`: `getPushPermission()`, `requestPushAndRegister()` (prompt → register with APNs → POST the token), `disablePush()`. Dynamic imports, no-ops on the web.
- `components/push-primer.tsx`: the card. Native only, shown when permission is `prompt`, the scan matched, and the not-now count is under three. Yes calls `requestPushAndRegister()`. Mounted inside `ScanReceipt`.
- `components/native-auth-bridge.tsx` grows two listeners: `registration` (token refreshes re-POST) and `pushNotificationActionPerformed` (navigate to the payload's path, POST opened). It is already the one component that lives for the app's lifetime.
- Account page: a Notifications row with a toggle, reflecting `checkPermissions()` plus the server's `enabled` flag. Off calls DELETE. If the OS permission is denied, the row says so and links to Settings.

## Acceptance criteria

1. **Given** the native app after a first scan with a match, **when** the receipt renders, **then** the primer card appears with the fragrance's name in it; on the web it never appears.
2. **Given** the primer, **when** the user taps "Yes, notify me", **then** the OS prompt appears exactly once, and on Allow a row exists in `push_tokens` for that user with `platform = 'ios'`.
3. **Given** "Not now" tapped three times across three scans, **when** a fourth scan matches, **then** no primer appears.
4. **Given** a user with an enabled token and a matched scan yesterday, **when** the cron runs, **then** one notification arrives on the device, one row exists in `push_sends`, and a second run the same day sends nothing.
5. **Given** the notification on the lock screen, **when** tapped, **then** the app opens on that fragrance's page and `opened_at` is set on the send row.
6. **Given** the Account toggle turned off, **when** the cron runs the next day, **then** that user receives nothing.
7. **Given** APNs answering 410 for a token, **when** the cron handles it, **then** the token is disabled and not retried.
8. **Given** account deletion, **when** the purge runs, **then** `push_tokens` and `push_sends` for that user are gone (purge test extended).

## Out of scope

- Android (FCM, the Android primer). Same server, different transport, waits for the shell.
- Any second campaign. The digest and the wishlist alert are logged as candidates in the build log.
- Rich notifications, images, badges, notification categories.
- A dashboard. `push_sends` plus PostHog is the measurement for now.

## How it will be shown working

`npm run push:test` against your account, screen recording of the phone receiving it and opening to the bottle, the `push_sends` row, and the Account toggle stopping a second test send. Criteria 1 through 3 by a recording of a scan on the device. Criterion 8 by `npm run test:purge`.

## Needs Josh

- An APNs Auth Key: developer.apple.com → Certificates, Identifiers & Profiles → Keys → +, name it, tick Apple Push Notifications service, download the `.p8` once (it cannot be re-downloaded), note the Key ID. Then the four `APNS_*` env vars in Vercel plus `CRON_SECRET`. The `.p8` contents go into `APNS_PRIVATE_KEY` as-is, newlines included.
- The Push Notifications capability in Xcode, which needs your signed-in account.

## Known risk

Vercel Hobby crons run once a day at most and can drift by up to an hour. Fine for a daily job; not fine if a second campaign ever wants hourly. Pro removes the limit if it comes to that.
