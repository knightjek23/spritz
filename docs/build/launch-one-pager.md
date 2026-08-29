# Spritz — Native App Store Launch (iOS + Android)

**Owner:** Josh
**Status:** Approved, in build
**Created:** August 29, 2026
**Parent PRD:** `Spritz_PRD_v1.md` (this work graduates PRD non-goal #4 and P2 item "Native iOS / Android apps")
**Runbook (steps):** `APP_STORE_LAUNCH.md` — partly stale as of Aug 29, see "What changed" below
**Build map:** `docs/build/build-map.md`

---

## Problem

Spritz works as a mobile web PWA, but the PWA cannot do the one thing that would make people come back: **push notifications**. Safari web push does not count for App Store review and is unreliable in practice. A fragrance user scans a bottle, learns about it, saves it to their wishlist, and then has no reason to reopen the app until the next time they happen to be holding a bottle. There is no re-entry point.

The second problem is distribution. "Add to Home Screen" is a discovery dead end. The audience lives on TikTok and Reddit, and the natural next step after seeing the app mentioned is to search an app store, not to visit a URL and figure out a PWA install.

## Why now

The entitlement architecture is already built. `app/api/webhooks/revenuecat/route.ts` and `capacitor.config.ts` are committed, and both web (Stripe) and mobile (RevenueCat) converge on the same Supabase truth: `users.plan = 'pro'` plus `users.is_lifetime`. The expensive design work is done. What remains is a native layer, compliance work, and store logistics.

Timing also matters on the Android side: a personal Play account must run a 14-day continuous closed test before it can apply for production. That clock runs in parallel with development at zero cost, and every day it is not started is a day added to the Android launch date.

## Success metric

Store approval is a **gate**, not a metric. Getting approved means the work is allowed to start being measured.

**Primary (product outcome):**

| Metric | Target | Measured |
|---|---|---|
| Push opt-in rate | ≥60% of native installs | Device token registrations / installs |
| D7 retention, native | ≥45% (web target is 35%) | Cohort, split by platform |

**Secondary:**

| Metric | Target | Measured |
|---|---|---|
| D30 retention, native | ≥25% (web target is 18%) | Cohort, split by platform |
| Push → session rate | ≥15% of sends open the app | Notification open events |
| Native install share of new signups | ≥25% within 60 days | Signup source |
| Native scan success rate | Not worse than web (≥85% top-1) | `scan_events`, split by client |

**Guardrails (a launch that moves these the wrong way is not a win):**

- Scan latency p50 on native must not exceed the web's 5.0s.
- Free-to-Pro conversion on native must not fall below web conversion by more than the Apple fee gap (15% IAP vs ~3% Stripe). If it does, native monetization is a loss, not a win.
- Crash-free session rate ≥99.5%.

## Solution sketch

A **Capacitor** native shell that loads the live `spritzofficial.app` site, with a real native layer bolted on:

- **Push notifications** (APNs + FCM) — the retention bet and the primary Guideline 4.2 defense.
- **Native camera** for the bottle scan, replacing `getUserMedia` when running natively.
- **Native purchases** via RevenueCat (StoreKit on iOS, Play Billing on Android), converging on the existing entitlement model. Stripe is hidden inside the app; showing it is an automatic 3.1.1 rejection.
- **In-app account deletion** plus a public web deletion URL. Required by both stores, missing today.
- **Native polish**: offline screen, safe areas, status bar, Android back button, haptics.

Front-end changes continue to deploy through Vercel. The native app is rebuilt only when native code or plugins change.

## Non-goals

Deliberately out of scope for this launch. Not a future ideas list.

1. **No iPad or tablet layouts.** Phone portrait only, same as the PWA.
2. **No widgets, App Clips, Live Activities, or Android equivalents.**
3. **No external link-out payments.** Apple's US 0% link-out is real today but legally unstable, with proposed rates filed Aug 13 2026 and a Supreme Court hearing in the term beginning October 2026. Build IAP. Revisit after the dust settles.
4. **No offline catalog.** An offline *screen* is in scope. Offline browsing of fragrance data is not.
5. **No new product features.** No scent journal, no social layer, no scan v3, no taste profile. If it is not required to ship or to defend Guideline 4.2, it waits.
6. **No localization.** English only.
7. **No Android-specific features.** Android is parity with iOS, nothing more.
8. **No bundling the web app locally.** Decided at map time, see `decisions.md` D3. Revisit only on a 4.2 rejection.

## Risks and open questions

| Risk | Severity | Mitigation |
|---|---|---|
| **Apple Guideline 4.2 rejection** ("repackaged website"). Capacitor's own docs say `server.url` is "not intended for use in production." | **High** | Ship push + native camera + offline handling before submitting. Record a reviewer-notes video demonstrating each. If rejected, lead the resubmission with the native features; fall back to the hybrid shell (map option 3) only if a second rejection lands. |
| **Clerk OAuth fails inside the webview.** Google blocks OAuth in embedded webviews (`disallowed_useragent`). | **High** | Tested in slice 2, deliberately early. Fix is routing sign-in through `ASWebAuthenticationSession` / Chrome Custom Tabs via the Capacitor Browser plugin. |
| **Apple banking not "Clear" blocks all IAP testing.** Most underestimated Apple gate. | High | Slice 1, day one. Nothing about purchases can be tested until it clears. |
| **Play closed-test rejection.** Google rejects production applications when testers were not continuously opted in or did not actually use the app. | Medium | Recruit 14+ testers for a 12-tester requirement. Brief them that installing and opening the app matters, not just accepting the invite. |
| **Stripe checkout reachable in the iOS webview** → automatic 3.1.1 rejection. | High | `isNativeApp()` branch on the pricing page, verified on device before submission. The reviewer will find `/pricing`. |
| **Xcode 26 / iOS 26 SDK required** since Apr 28 2026. | Medium | Verified in slice 2 before any other native work. May force a Capacitor iOS platform upgrade. |
| **Play target API 36 + Billing Library 8** mandatory Aug 31 2026. | Medium | Pin at first build. Does not block a new app, but a mid-project upgrade would hurt. |
| **Privacy manifest missing.** Capacitor is on Apple's third-party SDK list; `PrivacyInfo.xcprivacy` and signature validation are required. | Medium | Slice 9. `UserDefaults` is the declaration most hybrid apps miss. |
| **Leaked Supabase keys** still committed in `.env.example` at HEAD on the public repo (July audit, pending). | Medium | Confirm rotation before store launch. A public app raises the value of the leak. |
| Multi-source entitlement: a user holds both a Stripe sub and an Apple IAP. | Low | Both write `plan='pro'` so access is correct. Hide the IAP CTA when `plan === 'pro'` already. `pro_source` column deferred. |

**Open questions**

| # | Question | Owner | Status |
|---|---|---|---|
| Q1 | Is the name "Spritz" available on both stores? | Josh | Blocking slice 1 |
| Q2 | Apple enrollment as Individual or Organization? Seller name is public either way. | Josh | Blocking slice 1 |
| Q3 | Does the App Store subscription carry the 7-day free trial that the web offers? | Josh | Blocking slice 7 |
| Q4 | What is the first real push campaign? Wishlist sale alert requires price monitoring that does not exist yet. | Josh / Eng | Blocking slice 5 |
| Q5 | Has the July Supabase key rotation been completed? | Josh | Blocking submission |

## What changed since the July 21 runbook

`APP_STORE_LAUNCH.md` remains correct on architecture and RevenueCat setup. It is stale or silent on these, all verified against primary sources on Aug 29 2026:

- **In-app account deletion** (Apple 5.1.1(v)) is a hard requirement and is not in the runbook. Play additionally requires a **public web deletion URL**.
- **Play's closed-testing requirement**: personal accounts created after Nov 13 2023 need 12 testers opted in continuously for 14 days, then up to 7 days for production review. Organization accounts are exempt but need a D-U-N-S number.
- **Xcode 26 / iOS 26 SDK** required for all uploads since Apr 28 2026.
- **Play target API 36 and Billing Library 8** mandatory Aug 31 2026.
- **Privacy manifests**: Capacitor is on Apple's required third-party SDK list.
- **Age ratings**: new 4+/9+/13+/16+/18+ tiers with a mandatory questionnaire since Jan 31 2026.
- **Apple US link-out** is currently 0% commission post-Epic, but unstable. Out of scope, see non-goal 3.
- **Play fee model changed June 30 2026** for US/UK/EEA: 10% service fee on auto-renewing subscriptions plus 5% billing fee when using Play Billing. Roughly at parity with Apple's 15% Small Business rate.
