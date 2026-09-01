# Slice 1 — Registering with Apple and Google Play

Step by step, current as of **August 29, 2026**. Both signup flows changed in the last eighteen months, so anything older than that found online is likely wrong on at least one step.

**Do Apple and Google in parallel, not in sequence.** Each has a waiting period you cannot compress, and they do not depend on each other. Total hands-on time is around 90 minutes. Total elapsed time is three to five days.

---

## Before you start, have these ready

| Item | Used by | Notes |
|---|---|---|
| Your **legal name**, exactly as on government ID | Both | Not a nickname, not "Spritz". Apple delays approval over mismatches. |
| A **physical address** | Both | P.O. boxes are rejected by Apple. |
| A **credit card in your own name** | Both | Apple requires individual enrollees to pay with their own card. Using someone else's delays enrollment and triggers a photo-ID request. Google does not accept prepaid cards. |
| **Government photo ID** | Google, sometimes Apple | Google may request it during verification. |
| A **non-rooted Android phone or tablet, Android 10+** | Google | Mandatory. See B5. Borrowing one for sixty seconds is fine. |
| **Bank account and routing details** | Apple | For the payouts step, which gates all IAP testing. |
| Your **US tax details** (SSN or EIN for a W-9) | Apple | |

---

# Part A — Apple Developer Program

**Hands-on: ~45 minutes. Waiting: 24 to 48 hours for approval, then hours to days for banking.**

## A1. Prepare the Apple Account first

Pick the Apple Account that will own this **permanently**. Migrating an app to a different developer account later is possible but genuinely painful.

1. Sign in at [account.apple.com](https://account.apple.com).
2. Turn on **two-factor authentication**. Enrollment refuses to proceed without it, so doing it now avoids a restart.
3. Check the name on the account. It has to be your **legal name**. Apple states plainly that entering a name incorrectly delays approval.

## A2. Decide: web or the Apple Developer app

This is a real choice, not a formality, and nobody tells you about it up front.

| | Web | Apple Developer app |
|---|---|---|
| Payment | One-time purchase, renewed manually each year | **Auto-renewing annual subscription** |
| Risk | You can forget to renew and your apps get pulled | You keep paying for accounts you have abandoned |
| Available to | Everyone | Individuals and sole proprietors only |

**Take the web path.** A missed renewal is a visible, recoverable problem. A forgotten subscription is an invisible, recurring one. If you do use the app, set a calendar reminder for renewal season either way.

## A3. Enroll

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) and click **Start Your Enrollment**.
2. Sign in with the Apple Account from A1.
3. Select **Individual / Sole Proprietor**. (Per D6. Organization would need a legal entity plus a D-U-N-S number, up to 30 days.)
4. Fill in: legal name, address (no P.O. box), phone, email.
5. Read and accept the **Apple Developer Program License Agreement**.
6. Pay **$99 USD** with your own credit card.

> **The name field is the one that matters.** It becomes the contract name and it feeds the permanent public developer name in A7.

## A4. Wait for approval

Usually 24 to 48 hours. You may be asked to verify identity in the Apple Developer app. If nothing has arrived 24 hours after payment, Apple's own guidance is to contact them rather than wait.

## A5. Agreements, Tax, and Banking — do not skip or defer this

This is the step that quietly breaks slice 7 if it is left half-finished.

In [App Store Connect](https://appstoreconnect.apple.com) → **Business**:

1. **Paid Applications Agreement** → Request, then accept. Until it shows **Active**, in-app purchases do not work at all, sandbox included.
2. **Tax** → complete the US W-9 (and any others offered).
3. **Bank Account** → add your account, then keep checking the status field until it reads **"Clear."**

> **Why this matters more than it looks.** With banking incomplete, your IAP products simply do not load in the app. No error, no warning, just an empty product list. It looks exactly like a bug in the purchase code, and it is a reliable way to lose a day in slice 7. Get it to "Clear" now, while nothing depends on it.

If it is still pending after five business days, contact Apple.

## A6. Enroll in the Small Business Program

[developer.apple.com/app-store/small-business-program](https://developer.apple.com/app-store/small-business-program/)

Drops Apple's commission from 30% to **15%** while you are under $1M/year. The rate takes effect **15 days after the end of the fiscal month your enrollment is approved**, so enrolling now instead of at launch is real money on the first sales.

## A7. Create the app record — read this section twice

App Store Connect → **Apps** → **+** → **New App**.

| Field | Value |
|---|---|
| Platform | iOS |
| Name | `Spritz: Fragrance Guide` |
| Primary language | English (U.S.) |
| Bundle ID | `app.spritzofficial` |
| SKU | `spritz-ios` |
| **Company Name / developer name** | Your legal name |

Two things to know before clicking Create:

- **The developer name is permanent.** Apple sets it here, once, and provides no way to edit it afterward. Individual enrollments cannot enter "Spritz". Converting to Organization later does not reliably change it.
- **If the bundle ID does not appear** in the dropdown, register it first under Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App, description "Spritz", bundle ID `app.spritzofficial` (explicit).

If `Spritz: Fragrance Guide` is rejected as taken, try `Spritz — Fragrance Guide` or `Spritz: The Fragrance Guide`, and log whichever you use in `decisions.md`.

---

# Part B — Google Play Console

**Hands-on: ~40 minutes. Waiting: up to 5 days for payment verification.**

## B1. Pick the Google Account

Whichever account you sign up with becomes the **account owner**, and ownership is awkward to move later. Use one you control permanently and are not sharing.

## B2. Sign up

1. Go to [play.google.com/console/signup](https://play.google.com/console/signup).
2. Choose **"Yourself"** for account type, which creates a **personal** account. (Per D2.)
3. Accept the Google Play Developer Distribution Agreement.

> **The account type is not a casual toggle.** Certain app categories, finance, health, VPN and government, require an Organization account outright. A fragrance encyclopedia does not, so personal is correct here.

## B3. Pay the fee

**$25 USD, one time, not annual.** Mastercard, Visa, Amex, or Discover in the US. **Prepaid cards are rejected.**

## B4. Fill in developer details and verify them

You will provide:

- **Developer name** → set this to **`Spritz`**. Unlike Apple, this is not forced to your legal name and it can be changed later. This is the name users actually see on your Play listing.
- Legal name, legal address
- Contact email and contact phone
- A public-facing developer email

Then verify. Google sends a **one-time password to each of the contact email, the contact phone, and the developer email**, separately. All three have to stay working for the life of the account, since this is how Google reaches you about policy problems.

## B5. Device verification — the step people miss

New personal accounts must prove access to a real Android device before they can publish. There is no way around it and no web-only alternative.

**You need:** any **non-rooted physical Android device running Android 10 or later**. A tablet counts. A borrowed phone counts.

1. Open Play Console on the web, signed in as the account owner.
2. Find the verification task on the **Home** page.
3. Scan the QR code shown, which installs and opens the **Play Console mobile app**.
4. Sign in on the phone with the same Google Account.
5. Tap **Verify**.

It takes under a minute. The device is not tied to your account afterward, you will not need it again for re-verification, and your phone number is not collected. The same device can verify more than one account, so borrowing one is completely fine.

## B6. Set up the payments profile

Required before you can sell anything, and separate from the $25 fee. Play Console → **Setup → Payments profile**, which creates or links a Google Payments merchant profile.

Bank verification runs by micro-deposit challenge or document upload and takes **up to 5 days**. Same principle as Apple's banking: start it now so it is finished before slice 7 needs it.

## B7. Note the developer verification deadline

Google is rolling out Android developer verification with changes effective **September 30, 2026**, roughly a month out. New accounts should be verified as part of normal setup, but check the Play Console **Home** page for any outstanding registration task rather than assuming it is handled. ([policy page](https://support.google.com/googleplay/android-developer/answer/10788890))

---

## The gotchas, collected

| Gotcha | Cost if missed |
|---|---|
| Apple bank status not "Clear" | IAP products silently fail to load in slice 7. Looks exactly like a code bug. |
| Paying Apple with someone else's card | Enrollment delayed, photo ID demanded |
| Legal name mistyped on Apple | Approval delayed, and the public developer name is permanent |
| Enrolling through the Apple Developer app | Becomes an auto-renewing subscription rather than a manual purchase |
| No Android 10+ device on hand | Play account cannot publish at all |
| Prepaid card at Google | Payment rejected outright |
| Play developer name left as a default | The name users see on your listing is wrong, though this one is fixable |
| Skipping the Small Business Program | 30% instead of 15% on early sales |

## What this unblocks

- **Apple approved + app record created** → slice 2 can sign a build.
- **Apple banking "Clear"** → slice 7 can test purchases. Nothing about IAP works before this.
- **Play account registered + device verified** → slice 3 can upload a build and start the 14-day tester clock, which is the longest single item on the Android critical path.
