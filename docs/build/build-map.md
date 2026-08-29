# Spritz Native Launch — Build Map

**Approved:** August 29, 2026
**One-pager:** `docs/build/launch-one-pager.md`
**Decision log:** `docs/build/decisions.md`
**Build log:** `docs/build/build-log.md`

A slice is the smallest piece that can be built, verified against acceptance criteria, and shown working. Slices are ordered by dependency first, then by risk.

---

## The map

| # | Slice | Position rationale | Acceptance criteria (done means) | Tier 1 decisions expected |
|---|---|---|---|---|
| 1 | **Accounts, agreements, banking** | Nothing downstream works without it and it is pure latency, not effort. Apple's Paid Applications Agreement plus tax and bank status "Clear" blocks all IAP testing. | Apple Developer Program active; Paid Apps agreement signed; tax forms submitted; bank status "Clear"; Small Business Program enrolled; Play Console registered and identity verified; app name confirmed available on both stores. | Individual vs Organization enrollment; app name if "Spritz" is taken; store price points |
| 2 | **Capacitor shell runs on both platforms** | Foundation for everything native. Also the cheapest early test of the riskiest unknown: whether Clerk auth survives inside a webview. | App installs and launches on a physical iPhone and a physical Android device; loads the live site; sign-in completes on both including Google and Apple SSO; app icon and splash render correctly; iOS builds against Xcode 26 / iOS 26 SDK; Android targets API 36. | OAuth strategy if webview sign-in breaks; Capacitor version pinning |
| 3 | **Start the Android closed test** | The 14-day clock is the deliverable, not the build. Uses slice 2's binary as-is. Every day of delay is a day on the end of the Android launch. | Signed AAB uploaded to a closed track; 14+ testers invited for a 12-tester requirement; all opted in and confirmed installed; day 1 of 14 recorded with a date. | Who the testers are |
| 4 | **Account deletion, in-app and web** | Hard reject on both stores. Cheap, independent of native work, and ships to web too. Doing it early removes a submission-day surprise. | Given a signed-in user, when they confirm deletion in the app, then the Clerk user is deleted, all Supabase rows for that user are purged, and they are signed out. A public deletion-request URL is reachable without an account. Deletion is reachable in at most two taps from Account. | What "associated data" includes; whether deletion is immediate or has a grace window; reauthentication requirement |
| 5 | **Push notifications, end to end** | The chosen launch goal and the strongest Guideline 4.2 defense. Depends on the shell. | APNs key and FCM configured; permission primer shown before the OS prompt; device token stored against the user; a test send reaches a real device on both platforms and deep-links to the right screen; opt-out works. | Permission priming moment and copy; the first real campaign; deep-link targets; notification frequency cap |
| 6 | **Native camera scan** | Second 4.2 pillar and it improves the core loop. Depends on the shell. | Given the native app, when the user taps Scan, then the native camera opens, and a captured photo produces a match at no worse accuracy or latency than the web path. Gallery upload still works. Permission denial has a recovery path. | Native camera UX vs the existing web capture flow; what happens on permission denial |
| 7 | **Native purchases** | Depends on slice 1 banking being Clear. Includes hiding Stripe inside the app, which is an automatic 3.1.1 rejection if missed. | Three products live in App Store Connect and Play Console; RevenueCat entitlement `pro` maps all three; a sandbox purchase flips `users.plan` to `pro` via the webhook; lifetime sets `is_lifetime`; sandbox expiration drops to `free`; lifetime survives expiration; no Stripe checkout or external upgrade link is reachable anywhere inside the app. | Free trial on the Apple subscription; what an already-Pro-via-Stripe user sees; restore-purchases placement |
| 8 | **Native polish and offline** | Attached to the native work, not deferred to a polish phase that never comes. | No white flash on launch; safe areas correct on notched devices; status bar styled; Android hardware back button navigates rather than exiting; offline state shows a real screen, not a webview error; external links open in the system browser. | Offline screen content; back-button behavior at the root |
| 9 | **Store listings and compliance** | Needs a finished app for screenshots. | Screenshots for required device sizes on both stores; `PrivacyInfo.xcprivacy` with Required Reason API declarations; App Privacy nutrition labels covering Clerk, RevenueCat and analytics; Play Data Safety form including data deletion; age rating questionnaire complete; description, keywords, category, support URL; reviewer demo account and notes. | Category; keywords; screenshot story; age rating answers |
| 10 | **TestFlight and full verification** | Verify against acceptance criteria before a reviewer does. | Every acceptance criterion in slices 2 through 8 demonstrated on a physical device with evidence captured; TestFlight build installed and run end to end; reviewer-notes video recorded showing push, native camera and IAP. | None expected |
| 11 | **Submit Apple, apply for Play production** | | iOS build submitted for review; Play production access application submitted with the closed-test summary; written rejection-response plan for 4.2 and 3.1.1. | Rejection response strategy if it happens |
| 12 | **Measurement** | Launch is the start of measuring, not the end. | Analytics split native vs web; the one-pager's targets and guardrails wired to real queries; success and failure thresholds pre-committed with the action for each. | Which analytics events; thresholds |

---

## Critical path

```
Slice 1 ──┬── Slice 2 ── Slice 3 ─────────── [14-day tester clock] ── Slice 11 (Play) ── [≤7d review]
          │        └── Slices 5, 6, 8 ──┐
          └── (banking Clear) ── Slice 7 ┴── Slice 9 ── Slice 10 ── Slice 11 (Apple) ── [24-72h review]

Slice 4 runs independently, any time before Slice 9.
```

- **Apple:** roughly 2 to 3 weeks.
- **Android:** roughly 4 to 6 weeks, gated by the tester clock, not by engineering.
- Slices 1, 2 and 3 are pure latency. Delay there adds directly to the launch date. Everything else is effort and can compress.

## Cross-cutting constraints

These apply to every slice, not to one of them.

- **Guideline 3.1.1:** no Stripe checkout, no "subscribe on the web" link, no external upgrade CTA reachable anywhere inside the native app. Every slice that touches the pricing page or an upgrade prompt must respect the `isNativeApp()` branch.
- **Guideline 4.2:** every native capability added is 4.2 evidence. Capture a screen recording of each as it lands, rather than reconstructing them at submission time.
- **Both stores' privacy declarations must match actual behavior.** Any new SDK or data collection in any slice updates the nutrition label and the Data Safety form.
- **Version pins:** iOS builds against Xcode 26 / iOS 26 SDK. Android targets API 36 with Billing Library 8+. Resolve the Capacitor version that satisfies both before slice 2 writes any code.
- **The web app stays the product.** Front-end changes deploy via Vercel. A native rebuild happens only when native code or plugins change.

## Pre-existing debt to clear before submission

Carried from earlier sessions, not part of any slice but blocking a public store launch:

- Supabase key rotation from the July 9 audit (leaked keys committed in `.env.example` at HEAD on the public repo).
- `VOYAGE_API_KEY` set in Vercel.
- Bottle image audit and backfill (`audit:images`, `backfill:images`).
- Commit and push the current working tree.
