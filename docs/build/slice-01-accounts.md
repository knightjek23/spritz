# Slice 1 — Accounts, agreements, banking

**Status:** Open, awaiting Josh
**Type:** No code. Credential-gated, so this is a runbook Josh executes, not work Claude can do.
**Blocks:** Everything. Slice 2 needs the Apple team to sign a build. Slice 3 needs the Play account. Slice 7 cannot be tested at all until Apple banking reads "Clear."

---

## What this slice does

Creates the two developer accounts, signs the agreements, and gets the money plumbing to a state where in-app purchases can actually be tested. This is pure latency, not effort: perhaps two hours of form-filling spread across three to five days of waiting on Apple and Google. Every day it is not started is a day added to both launch dates.

**Decisions already made:** app name is **Spritz: Fragrance Guide** (D5), Apple enrolls as **Individual** (D6), Play enrolls as a **personal account** (D2).

---

## Acceptance criteria

- **Given** no developer accounts exist, **when** this slice closes, **then** the Apple Developer Program membership is active, the Paid Applications Agreement is signed, tax forms are submitted, and the bank account status in App Store Connect reads **"Clear."**
- **Given** an active Apple account, **when** the app record is created, **then** the app name is "Spritz: Fragrance Guide", the bundle ID is `app.spritzofficial`, and the developer name has been reviewed before saving, because it cannot be changed afterward.
- **Given** no Play account exists, **when** this slice closes, **then** the Play Console account is registered, identity verification is submitted, and the developer name is set.
- **Given** both accounts, **when** checked, **then** the Small Business Program (Apple, 15%) is enrolled and "Spritz: Fragrance Guide" was accepted as an available name on both stores.

**Out of this slice:** creating in-app purchase products (slice 7), the RevenueCat project (slice 7), store listing content and screenshots (slice 9), anything involving code.

---

## Runbook

Do them in this order. Steps 1 and 4 start clocks, so do those first even if you stop afterward.

### 1. Apple Developer Program — start now, it gates the most

1. Sign in at **developer.apple.com/programs/enroll** with the Apple Account you want to own this permanently. Not a throwaway.
2. Turn on two-factor authentication on that account first. Enrollment refuses without it.
3. Choose **Individual / Sole Proprietor**. Pay $99/yr.
4. Expect approval in roughly 24 to 48 hours. You may be asked to verify identity in the Apple Developer app.

> **Do not create the app record yet.** The developer name is set the first time you add an app and Apple will not let you edit it. Read step 3 before you touch that screen.

### 2. Agreements, Tax, and Banking — the step everyone underestimates

In **App Store Connect → Business**:

1. Sign the **Paid Applications Agreement**. Until this is active, in-app purchases do not work, including in sandbox. You will not be able to test the paywall at all.
2. Complete **tax forms** (US: W-9).
3. Add your **bank account**. Then watch the status field. It has to read **"Clear."** Anything else and IAP products will silently fail to load in slice 7, which looks exactly like a code bug and costs a day to diagnose.
4. Enroll in the **App Store Small Business Program**. 15% instead of 30% while you are under $1M/yr. The rate takes effect 15 days after the end of the fiscal month your enrollment is approved, so enrolling now rather than at launch is worth real money.

**Stop-and-check:** bank status "Clear" is the gate on slice 7. If it is still pending after five business days, contact Apple rather than waiting.

### 3. Create the Apple app record — read this twice before saving

App Store Connect → Apps → **+**:

| Field | Value | Notes |
|---|---|---|
| Platform | iOS | |
| Name | `Spritz: Fragrance Guide` | 23 chars. If taken, try `Spritz — Fragrance Guide` or `Spritz: The Fragrance Guide` and log the change in `decisions.md`. |
| Primary language | English (U.S.) | |
| Bundle ID | `app.spritzofficial` | Must match `capacitor.config.ts`. Register it in Certificates, Identifiers & Profiles first if it does not appear. |
| SKU | `spritz-ios` | Internal only, never shown. |
| **Company Name / developer name** | Your legal name | **Permanent. Cannot be edited after this save.** Individual enrollments cannot use "Spritz" here. |

### 4. Google Play Console — start the clock

1. Register at **play.google.com/console** for **$25, one time**. Personal account (D2).
2. Have ready: legal name, legal address, contact email and phone, a public-facing developer email, a **government ID**, and a **credit card in your legal name**.
3. Set the **developer name**. Unlike Apple, this one is not your legal name by default and it is editable later, so put **Spritz** here.
4. Submit identity and payment verification. Budget **up to 5 days**.

**Why this is urgent:** a personal Play account cannot apply for production until it has run a closed test with 12 testers opted in continuously for 14 days. That clock cannot start until this account exists and a build is uploaded (slice 3). Registering today is worth roughly a week at the far end.

### 5. Confirm the name is actually free

Before committing anywhere, search both stores for "Spritz: Fragrance Guide". Apple enforces uniqueness at app-record creation; Play is looser but a collision is still worth avoiding. "Spritz" alone is definitely taken on iOS.

### 6. Start recruiting 12 Play testers

They do not need the app yet, only a Gmail address and a willingness to install when slice 3 lands. Recruit **14 or more** for a 12-tester requirement: Google rejects production applications when testers were not continuously opted in for the full 14 days, and one person dropping out restarts nothing but does put you under the line.

Brief them plainly: install it, open it a few times over two weeks, do not uninstall. Passive acceptance of the invite does not count.

---

## Also, before any store submission

Carried debt from earlier sessions. None of it belongs to a slice, but a public app makes each of these worse:

- [ ] **Supabase key rotation** from the July 9 audit. The leaked keys are still committed in `.env.example` at HEAD on the public GitHub repo. Path is in `LAUNCH_RUNBOOK.md`: create `sb_publishable_` / `sb_secret_` keys, swap the env values, upgrade `@supabase/supabase-js` and `@supabase/ssr`, then deactivate the legacy keys.
- [ ] `VOYAGE_API_KEY` set in Vercel.
- [ ] Bottle image audit and backfill.
- [ ] Commit and push the working tree, which currently has uncommitted changes across ~40 files.

---

## How this gets verified

Screenshots of: Apple membership status active, Paid Applications Agreement showing active, bank account status reading "Clear", Small Business Program enrolled, the created app record, and the Play Console account with verification submitted. Paste them here or just report each line, and slice 1 closes.
