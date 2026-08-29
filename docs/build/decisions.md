# Spritz Native Launch — Decision Log

Every Tier 1 and Tier 2 decision, with the options considered, the choice, who made it, and why. This is what lets a decision be reversed later and what lets a future session understand why the code looks the way it does.

**Format:** `## D<n> — <title>` then Date, Slice, Tier, Options, Choice, Decided by, Why.

---

## D1 — What going native is for

- **Date:** 2026-08-29
- **Slice:** Map
- **Tier:** 1
- **Options:** (a) Retention via push notifications. (b) Distribution and discoverability via store search. (c) Monetization via native IAP.
- **Choice:** (a) Retention via push.
- **Decided by:** Josh
- **Why:** Push is the capability the PWA cannot have and the strongest Guideline 4.2 defense, so the launch goal and the review defense are the same piece of work. Monetization was the weaker case: Apple takes 15% against Stripe's ~3%, so native IAP only wins if native conversion beats web by more than the fee gap.
- **Consequence:** Push is slice 5, ahead of purchases. Success metrics are retention-shaped, not revenue-shaped.

## D2 — Google Play account type

- **Date:** 2026-08-29
- **Slice:** Map / Slice 1
- **Tier:** 1
- **Options:** (a) Personal account, $25, subject to the 12-tester / 14-day continuous closed test before production. (b) Organization account, exempt from closed testing but requires a D-U-N-S number that can take up to 30 days.
- **Choice:** (a) Personal, with the tester clock started as early as possible.
- **Decided by:** Josh
- **Why:** Josh does not hold a D-U-N-S number. Requesting one takes up to 30 days, which is longer than the 14-day tester clock it would avoid. The clock also runs in parallel with development at no cost.
- **Consequence:** Slice 3 exists and must run as early as slice 2 allows. Android lands 4 to 6 weeks out rather than 2 to 3.

## D3 — Native shell architecture

- **Date:** 2026-08-29
- **Slice:** Map
- **Tier:** 1
- **Options:** (a) Capacitor `server.url` loading the live site, plus a strong native plugin layer. (b) Bundle the web app locally as static assets. (c) Hybrid: bundled native chrome wrapping remote content webviews.
- **Choice:** (a) Remote load plus a strong native layer.
- **Decided by:** Josh
- **Why:** Fastest path with one codebase, and front-end changes keep deploying through Vercel. Option (b) is a real rebuild because Spritz depends on ISR, server components and API routes, and it would put every front-end change behind an app update. The 4.2 risk is accepted knowingly and mitigated by the native layer.
- **Known tension:** Capacitor's own documentation states `server.url` is "not intended for use in production," and Apple's 4.2.2 names "repackaged website" explicitly. This is the highest-severity risk on the launch.
- **Reversal plan:** If Apple rejects under 4.2, resubmit leading with the native features. If a second rejection lands, move to option (c).

## D4 — External link-out payments are out of scope

- **Date:** 2026-08-29
- **Slice:** Map
- **Tier:** 1
- **Options:** (a) Ship RevenueCat IAP only. (b) Also ship a US link-out to web Stripe checkout, currently at 0% Apple commission post-Epic.
- **Choice:** (a) IAP only.
- **Decided by:** Claude, recommended and approved with the map
- **Why:** The US 0% commission is real today but legally unstable. Apple filed proposed commission rates on Aug 13 2026 and the Supreme Court hears the contempt appeal in the term beginning October 2026. Building a payment path whose economics may be reset within months, for the US only, is not worth the 3.1.1 exposure on a first submission.
- **Revisit:** After the district court sets a rate and the Supreme Court rules.
