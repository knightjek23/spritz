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

## D5 — Store app name

- **Date:** 2026-08-29
- **Slice:** 1
- **Tier:** 1
- **Options:** (a) "Spritz: Fragrance Scanner" (25 chars). (b) "Spritz: Fragrance Guide" (23 chars). (c) "Spritz: Scan Any Fragrance" (26 chars).
- **Choice:** (b) **Spritz: Fragrance Guide**. Subtitle decided separately, see D7.
- **Decided by:** Josh
- **Why:** Matches the PRD's encyclopedia positioning rather than reducing the product to its input method, and ages better if scan stops being the headline feature. Accepts weaker search intent than "scanner" in exchange for positioning consistency.
- **Note:** "Spritz" alone is unavailable. At least four apps use it on the US App Store, including Spritz: Cocktail Recipes, Spritz App, and Spritz: Clean & Succeed. The prefix-plus-descriptor form is required, not optional.
- **Consequence:** Subtitle carries the scan promise. Keywords field (slice 9) must pick up "scanner", "cologne", "perfume", "notes" since the name no longer does.

## D6 — Apple enrollment type

- **Date:** 2026-08-29
- **Slice:** 1
- **Tier:** 1
- **Options:** (a) Individual enrollment now, accepting that the public developer name is Josh's legal name permanently. (b) Organization enrollment, requiring a legal entity plus a D-U-N-S number (up to 30 days), displaying "Spritz" as the developer name. (c) Check for an existing entity or D-U-N-S first.
- **Choice:** (a) **Individual.**
- **Decided by:** Josh
- **Why:** Speed. Individual enrollment approves in roughly 24 to 48 hours against up to 30 days for a D-U-N-S, and the developer name line under the app title is close to invisible to real users.
- **Known cost, accepted:** Apple sets the developer name once, when the first app record is created, and does not allow editing it afterward. Individual enrollments must use the legal name. Converting to Organization later does not reliably change it. This is effectively permanent. Source: https://developer.apple.com/help/app-store-connect/create-an-app-record/set-your-developer-name
- **Consequence:** The Google Play developer name is a separate field with its own rules, so slice 1 sets it deliberately rather than by default.

## D7 — App Store subtitle

- **Date:** 2026-08-29
- **Slice:** 1 (used again in slice 9)
- **Tier:** 1
- **Options:** (a) "Every fragrance, broken down." (29 chars). (b) "Scan any cologne or perfume" (27). (c) "Scan a bottle. Know the notes." (30).
- **Choice:** (a) **"Every fragrance, broken down."**
- **Decided by:** Josh
- **Why:** It is already the homepage tagline, so the store listing and the site say the same thing in the same voice. Josh flagged the earlier draft as not reading naturally, which it did not, because it was written for the doc rather than lifted from the product.
- **Hard constraint found:** the App Store subtitle field caps at **30 characters**. The original draft, "Scan a bottle, know everything.", is 31 and would have been rejected at entry.
- **Consequence:** the subtitle carries no scan keyword, so slice 9's keyword field must carry "scan", "scanner", "cologne", "perfume" and "notes", and the first screenshot has to show the scan action since no text above the fold mentions it.

## D8 — App Store promotional text

- **Date:** 2026-09-01
- **Slice:** 9 (written early, since this field is editable without a version submission)
- **Tier:** 1
- **Options:** (a) "The moment" — opens inside the user's situation. (b) "The catalog" — leads with 10,000 fragrances. (c) "The launch note" — uses the field for launch news.
- **Choice:** (a) **"You're holding a bottle and you want to know what's in it. Scan the label. Notes, perfumer, house history, and how it actually wears, without opening five tabs."** (160 / 170)
- **Decided by:** Josh
- **Why:** Opens in the situation from the PRD's JTBD instead of describing the app, so the reader recognizes themselves before Spritz is mentioned. "Without opening five tabs" is the problem statement's actual pain, stated in the user's words.
- **Field properties that shaped it:** promotional text is 170 characters, sits above the description, is **editable without submitting a new app version**, and is **not indexed for App Store search** (Apple states it does not affect ranking and should not hold keywords). So it carries no ASO load and can be rewritten freely, which is why it was safe to settle before the positioning question in Q6.
- **Revisit:** swap for real news once there is any (new features, catalog milestones, seasonal hooks). That is what the field is for.

## D9 — Store positioning: encyclopedia leads, dupes as a Pro feature

- **Date:** 2026-09-01
- **Slice:** 9
- **Tier:** 1
- **Context:** PRD non-goal #1 says Spritz is not a dupe-finder and that price-delta framing is removed entirely. The live app contradicts this in three places: the home subhead ("which cheaper bottles smell almost the same"), a "Known dupes" section on the detail page, and the Pro pitch ("AI-generated dupes for any fragrance, on demand"). Raised as Q6 after it surfaced in the screenshots, the app preview footage, and the description draft.
- **Options:** (a) Encyclopedia leads, dupes described honestly as one Pro unlock. (b) Encyclopedia only, never mention dupes, change the app's own copy to match. (c) Dupes lead, encyclopedia supports.
- **Choice:** (a) **Encyclopedia leads, dupes named as a Pro feature.**
- **Decided by:** Josh
- **Why:** Describes what is actually shipping. Consistent with the name and subtitle already chosen (D5, D7), keeps the strategic bet the PRD argues for, and avoids the odd gap of charging for a feature the store page refuses to mention. Rejected (c) because dupe-finding is a crowded commodity category and both the name and subtitle point the other way, so the page would read inconsistently.
- **Consequence:** PRD non-goal #1 needs softening rather than deleting. Dupes are a Pro feature, not a headline, and never the first three lines of anything. Similar fragrances stay collapsed on the detail page.
- **Apple metadata constraints that bind regardless:** no trademarked terms you do not own, so no "smells like <brand>" anywhere in the listing. No data sources named, which also settles Q7 for the listing (though not for the app's own UI, still open).

## D10 — App Store keywords

- **Date:** 2026-09-01
- **Slice:** 9
- **Tier:** 1
- **Options:** (a) Balanced, 89 bytes. (b) Mainstream reach, swapping perfumer/niche/parfum for finder/bottle/tracker. (c) Enthusiast depth, adding sillage/longevity/accord.
- **Choice:** (a) **`scan,scanner,perfume,cologne,notes,dupe,collection,scent,perfumer,niche,identifier,parfum`** (89 / 100 bytes)
- **Decided by:** Josh
- **Why:** Covers the high-intent phrases (perfume scanner, cologne scanner, fragrance notes, perfume collection, fragrance dupe) while keeping perfumer, niche and parfum for the enthusiast audience the PRD's primary persona actually belongs to. Rejected (b) for competing with larger apps on broad terms while abandoning searches Spritz would rank first on; rejected (c) for ranking on longevity and sillage, which the app shows as "Not measured."
- **Mechanic that shaped it:** Apple forms phrases by combining keyword terms with words already indexed from the name and subtitle, so `fragrance` never appears in the field despite being the core term. Excluded as already-indexed: spritz, fragrance, guide, every, broken, down.
- **Revisit:** when longevity and sillage ship, add them into the 11 spare bytes. Keyword edits require a version submission, so bundle the change with an app update.

## D11 — Support and deletion page structure

- **Date:** 2026-09-01
- **Slice:** 4 / 9
- **Tier:** 1
- **Choice:** `/support` as the App Store Support URL, `/support/delete-account` as Play's standalone deletion URL, both sharing the legal pages' prose shell. Deletion requests are made by email from the account address rather than through a form.
- **Decided by:** Claude, with Josh's instruction to build both and use `josh.knight@spritzofficial.online`
- **Why email rather than a form:** Play requires a way to *request* deletion, not an automated pipeline. A form would need an endpoint, spam handling, and identity verification, all to send an email that the account holder can send themselves. Requiring the mail to come from the account address is also stronger identity proof than an unauthenticated form field. Revisit if volume ever justifies it.
- **Open, needs Josh:** the support address is on `spritzofficial.online` while the site is `spritzofficial.app`. Deliberate, or a typo? A support address that bounces is an App Review rejection cause, since review emails it.

## D12 — (unlogged)

- **Status:** referenced as part of "D1 through D12" in the 2026-09-02 session handoff, but never written into this file. The handoff's own list of locked decisions maps cleanly onto D1 through D11 plus "iOS before Android," which is the likely candidate. Number reserved rather than reused so nothing already referencing D12 shifts.
- **Action:** Josh to confirm what D12 was, then fill this in.

## D13 — iOS safe areas: full-bleed with token'd insets

- **Date:** 2026-09-03
- **Slice:** 2 (also settles part of slice 8)
- **Tier:** 1
- **Context:** The app had no `env(safe-area-inset-*)` anywhere and set no `viewport-fit`. On a notched iPhone the floating bottom-nav pill sat under the home indicator.
- **Options:** (a) `viewportFit: "cover"` plus `env()` insets on every fixed element. (b) Leave `viewport-fit` unset and let WKWebView lay the page out inside the safe area. (c) Cover, but patch only the bottom nav.
- **Choice:** (a) **Full-bleed with `env()` insets.**
- **Decided by:** Josh
- **Why:** (b) needs no CSS at all but paints theme-colored bands above and below the content on notched devices, which is exactly what a wrapped website looks like and exactly the impression Guideline 4.2 punishes. Given D3 already accepts a remote-load shell, the app cannot also afford to *look* like one. (c) fixes the reported bug with the smallest diff but leaves the top nav under the status bar and the `/scan` camera tray unresolved, both of which return in slice 8.
- **Implementation shape:** insets are exposed as `--safe-top/bottom/left/right` in `globals.css` with `0px` fallbacks, plus `--nav-pill-offset` and `--nav-clearance` for the floating pill's geometry. Fixed elements use the tokens, never a raw `env()` and never a hardcoded offset, so there is one place to look when something sits wrong on a device.
- **Consequence:** `--nav-clearance` resolves to exactly 112px when the inset is zero, which is what the old flat `pb-28` was, so the web layout is unchanged. Slice 8's "safe areas correct on notched devices" criterion is now largely met ahead of time; what remains there is the status-bar *style* and the launch flash.

## D14 — Google OAuth in the native shell: system browser plus deep link

- **Date:** 2026-09-03
- **Slice:** 2
- **Tier:** 1
- **Context:** Google refuses OAuth inside embedded webviews (`disallowed_useragent`), so Clerk's `<SignIn />` Google button dead-ends in the shell. Cookies do not cross between Safari and WKWebView, so the session also has to be handed back explicitly.
- **Options:** (a) System browser via `@capacitor/browser`, session handed back on a custom URL scheme as a Clerk sign-in token exchanged with the `ticket` strategy. (b) Native Google Sign-In SDK returning an idToken for Clerk to exchange. (c) Hide Google inside the app, offer email and Apple only.
- **Choice:** (a) **System browser plus deep link.**
- **Decided by:** Josh
- **Why:** Both halves exist in the pinned SDK (`@clerk/backend` `signInTokens.createSignInToken`, `@clerk/types` `TicketStrategy`), it uses first-party Capacitor plugins only, and Apple rides the same round trip. (b) adds a native dependency, a GoogleService plist, an iOS client ID and a second separate path for Apple, plus another SDK for the privacy label. (c) locks out every user who signed up through Google, since those Clerk accounts have no password.
- **Shape:** `/native-auth/start` (nonce cookie) → `/native-auth/go` (Clerk redirect) → `/native-auth/callback` (both force URLs on complete) → `/native-auth/complete` (60-second single-use token, 302 to `app.spritzofficial://sso-callback`) → `NativeAuthBridge` (nonce check, ticket exchange). Full design: `docs/superpowers/specs/2026-09-03-slice-2.2-native-oauth-design.md`.
- **Accepted residual risk:** `@capacitor/browser` is `SFSafariViewController`, so the callback goes through the OS URL router rather than being delivered privately as `ASWebAuthenticationSession` would. Mitigated by the nonce and the 60-second token. Closing it fully is a plugin swap, not a protocol change.

## D15 — Sign in with Apple: browser path now, native sheet later

- **Date:** 2026-09-03
- **Slice:** 2
- **Tier:** 1
- **Context:** Guideline 4.8 requires Sign in with Apple wherever Google is offered.
- **Options:** (a) Native `ASAuthorizationController` sheet via a Capacitor plugin, Clerk exchanging the identity token. (b) The same browser round trip as Google with `oauth_apple`. (c) Upgrade Clerk first, then (a).
- **First choice, then reversed:** Josh picked (a) on the recommendation. Checking the installed `@clerk/types` 4.26.0 showed `signIn.create` accepts oauth, ticket, google_one_tap, password, passkey and code strategies and nothing for an Apple identity token. Clerk ships native Apple token exchange only through its Expo hook (November 2025) and does not document the underlying strategy for other SDKs. Building (a) would mean calling an undocumented API from a 2024 SDK.
- **Choice:** (b) **Browser path now**, native sheet logged as a revisit.
- **Decided by:** Josh, on the corrected recommendation
- **Why:** Works today on what is installed, about twenty lines on top of D14, and still satisfies 4.8: the requirement is that an equivalent privacy-preserving option is offered, not that it use the native sheet. (c) puts a major-version auth upgrade inside slice 2, touching sign-in, middleware, webhooks and the account-deletion route verified two days ago; it deserves its own slice.
- **UI consequence:** Apple is listed first and styled identically to Google, per Apple's HIG on button prominence.
- **Revisit:** when Clerk is upgraded. Pre-req that still needs Josh: Apple must be enabled as a social connection in the Clerk dashboard with a Services ID and key, which the web flow needs regardless.

## D16 — App icon and launch screen

- **Date:** 2026-09-03
- **Slice:** 2 (pre-satisfies part of slice 8)
- **Tier:** 1
- **Icon options:** (a) `public/icon-512.png`, the S with the brass dot. (b) `public/icon-maskable-512.png`, plain S. (c) `brand/spritz-pfp-monogram.png`, lowercase serif s.
- **Icon choice:** (a) **S with brass dot**, rendered at 1024 on an opaque emerald field (Apple rejects alpha in the store icon).
- **Splash options:** (a) Cream `#F4EFE6` field with the serif wordmark centered. (b) Emerald field with the S mark.
- **Splash choice:** (a) **Cream with wordmark.**
- **Decided by:** Josh
- **Why:** The icon is what home-screen PWA users already have, so the native app and the web shortcut read as one product; the brass dot is the only detail separating it from every other green-square-white-letter icon. The splash matches the cream the app paints behind every page, so launch screen to first page is one continuous color, which is most of what slice 8 means by "no white flash." Emerald would hard-cut to cream a second later.
- **Also done in passing:** the storyboard background was `systemBackgroundColor`, which is white in light mode and black in dark mode, and flashes for a frame against the cream image either way. Now a fixed cream. `capacitor.config.ts` gains `backgroundColor: "#F4EFE6"` for the webview itself, for the same reason.

## D17 — Camera purpose string

- **Date:** 2026-09-03
- **Slice:** 2
- **Tier:** 1
- **Options:** (a) "Spritz uses the camera to scan fragrance bottles and identify them." (b) "Spritz needs camera access so you can scan a bottle's label to look it up." (c) "Scan a bottle to identify it and see its notes, perfumer, and how it wears."
- **Choice:** (a).
- **Decided by:** Josh
- **Why:** Feature plus benefit in one sentence, agreeing with the in-app primer the user has just read. (b) reads as a demand; (c) sells the feature without explaining the permission.
- **Why it matters now, not in slice 6:** the shell's camera is still `getUserMedia` inside WKWebView, which hard-crashes the app if `NSCameraUsageDescription` is absent. Slice 6's native camera will reuse the same string.

## D18 — iPhone orientation: portrait only

- **Date:** 2026-09-03
- **Slice:** 2
- **Tier:** 2
- **Choice:** `UISupportedInterfaceOrientations` trimmed to portrait on iPhone. iPad list left as generated.
- **Decided by:** Claude
- **Why:** Capacitor's template allows landscape by default; that was never a product choice. `public/manifest.webmanifest` already declares `"orientation": "portrait"` for the PWA, the whole app is laid out at `max-w-md`, and the `/scan` camera takeover assumes a portrait frame. Locking the shell to portrait makes the native app match the web app's existing decision rather than expanding it. Reversible in one line if iPad or landscape ever becomes a goal.
