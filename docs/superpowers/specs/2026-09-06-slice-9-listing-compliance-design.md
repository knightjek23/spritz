# Slice 9 — Store listing and compliance (iOS)

**Status:** manifest and device family done; the rest is answers for you to enter and screenshots for you to design. Confirm the answers below before entering them.
**Decisions:** D29 (screenshots: Josh designs in Figma from simulator captures), 2026-09-06. Metadata was D5, D7, D8, D9, D10 in slice 9's first pass.
**Play Data Safety:** waits for the Android shell.

## Done in code

- `ios/App/App/PrivacyInfo.xcprivacy`, added to the App target's Resources. Declares no tracking, six collected data types (below), and the UserDefaults required-reason API (CA92.1). Capacitor and each plugin carry their own manifests inside their packages.
- `TARGETED_DEVICE_FAMILY` set to iPhone only. The app is laid out at `max-w-md` and locked to portrait (D18); shipping it as an iPad app would mean iPad screenshots, iPad review, and an iPad experience nobody designed. iPad users can still install it in compatibility mode.

## App Privacy answers (App Store Connect → App Privacy)

"Do you or your third-party partners collect data from this app?" **Yes.**

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Contact Info → Name | Yes | Yes | No | App Functionality |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality |
| User Content → Other User Content | Yes | Yes | No | App Functionality |
| Identifiers → Device ID | Yes | Yes | No | App Functionality, Analytics |
| Usage Data → Product Interaction | Yes | No | No | Analytics |

Everything else: not collected. Specifically **not** collected: precise or coarse location, contacts, browsing history, purchase history (until slice 7 adds RevenueCat, at which point Purchases → Purchase History, linked, App Functionality is added), health, financial info, crash data (no crash SDK), search history (not stored per user), advertising data.

Why each row: email and name come from Clerk; photos are the scan images retained per `/legal/privacy`; other user content is the collection, wishlist and reactions; Device ID covers the APNs push token and PostHog's anonymous distinct id; product interaction is PostHog page views and events, which are never joined to a Clerk user because nothing calls `identify()`. The `ip_hash` on scan events is a salted hash used only for rate limiting and is not a listed data type.

The label produces "Data Linked to You" and "Data Not Linked to You" sections, and no "Data Used to Track You" section. That last one is what matters at review.

## Age rating questionnaire

Every question **None** or **No**, including: Unrestricted Web Access (No: Buy opens specific retailer pages in a sheet, not a browser), Gambling (No), Contests (No), alcohol/tobacco/drug references (None: fragrance is not any of those), medical (None), mature themes (None), user-generated content (No: reactions are private to the account and not shown to other users). Result: **4+**.

## Screenshots (D29)

Six screens at the 6.9-inch size, 1320×2868, the only size Apple requires; smaller phones scale from it. Captures come from the iPhone 17 Pro Max simulator against production, signed into the demo account with a populated shelf. You design the framed set in Figma; caption drafts are in `store-listing-copy.md` under "Screenshot captions".

Order tells the D9 story: encyclopedia first, scan as the way in, dupes as the Pro payoff.

1. Fragrance page, notes pyramid in view. "Every fragrance, broken down."
2. Scan intro, camera framed on a bottle. "Point at the label. That's it."
3. Match page with the scan receipt line. "Found it. Notes, perfumer, how it wears."
4. Library / Most popular right now. "Browse by house, note, or family."
5. Shelf with Own / Tried / Wishlist. "Your bottles, in one place."
6. Known dupes section on a Pro account. "Smells like this, costs less. Pro."

Capture, on the Mac (Simulator, not the phone; the phone is the 6.3-inch class):

```
xcrun simctl boot "iPhone 17 Pro Max"
open -a Simulator
# sign in, navigate to each screen, then for each:
xcrun simctl io booted screenshot ~/Desktop/spritz-shot-1.png
```

Simulator screenshots of the shell come out at 1320×2868 on that device. Take them in the app, not Safari, so the status bar and safe areas are the app's.

## Reviewer demo account and notes

- Create a throwaway account in the app with a memorable email you control, upgrade it to Pro on the web (Stripe test is not available on production, so use the real flow and refund, or set `users.plan = 'pro'` directly for that row), add six bottles to the shelf, scan two.
- Notes for the reviewer (App Review Information → Notes), draft:

  > Spritz identifies fragrance bottles from a photo of the label and shows their notes, perfumer, and how they wear. To test: tap Scan, point at any perfume bottle (or use the gallery to upload a photo of one), and the app returns the fragrance page. Native features: push notifications (Account → Notifications; a follow-up arrives the day after a scan), native camera and Photos picker on Scan, offline screen (airplane mode). Sign in with Apple and Google are offered alongside email. In-app account deletion is under Account → Manage account. The demo account below is Pro and has a populated shelf. Purchases: [slice 7 fills this in].

- Contact phone and email: yours.

## Acceptance criteria

1. **Given** a TestFlight build, **when** App Store Connect processes it, **then** no "missing privacy manifest" or "missing required reason" email arrives.
2. **Given** the App Privacy form saved with the table above, **when** the product page preview is viewed, **then** it shows Data Linked to You and Data Not Linked to You, and no Data Used to Track You.
3. **Given** the age rating questionnaire, **then** the result is 4+.
4. **Given** six 1320×2868 PNGs uploaded, **when** saved, **then** App Store Connect accepts them without a size warning.
5. **Given** the demo account credentials in the notes, **when** used on a fresh install, **then** sign-in works and the shelf is populated.

## Owed from this slice for later

- Purchase History row in App Privacy once slice 7 lands.
- `/legal/privacy` gets its in-app deletion wording back (flagged since slice 4) and a sentence on push tokens.
