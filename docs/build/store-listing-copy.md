# Spritz — Store Listing Copy

Every piece of App Store and Play listing text in one place, so the two stores stay in sync and nothing gets rewritten from memory. Character counts are Apple's unless noted.

**Blocked on:** Q6 (dupes vs encyclopedia positioning) and Q7 (Fragrantica named in the UI) in `launch-one-pager.md`. Both change the description and keywords. Promotional text is exempt because it can be rewritten any time.

---

## Apple App Store

### App name — 30 chars · PERMANENT-ish, requires a version submission to change
```
Spritz: Fragrance Guide
```
23 / 30. D5. "Spritz" alone is unavailable on the US App Store.

### Subtitle — 30 chars · requires a version submission
```
Every fragrance, broken down.
```
29 / 30. D7. Matches the homepage tagline so the site and the store speak the same way.

### Promotional text — 170 chars · editable ANY TIME, not indexed for search
```
You're holding a bottle and you want to know what's in it. Scan the label. Notes, perfumer, house history, and how it actually wears, without opening five tabs.
```
160 / 170. D8.

### Keywords — 100 bytes · requires a version submission · comma separated, NO spaces after commas
```
scan,scanner,perfume,cologne,notes,dupe,collection,scent,perfumer,niche,identifier,parfum
```
89 / 100 bytes, 12 terms. D10.

**Why these words and not others.** Apple combines keyword terms with words already indexed from the name and subtitle to form phrases, so "fragrance" (from the name) plus "scanner" (here) covers the search "fragrance scanner" at no byte cost. Deliberately excluded, because they are already indexed and repeating them wastes the field: `spritz`, `fragrance`, `guide`, `every`, `broken`, `down`.

Singular only, since Apple matches plurals itself. No spaces after the commas, each one costs a byte. No trademarked terms and no competitor app names, per Apple's rules.

**Searches this is built to win:** perfume scanner, cologne scanner, fragrance scanner, fragrance notes, perfume notes, perfume collection, fragrance dupe, perfume identifier, niche perfume, perfumer.

**Deliberately left out:** `sillage` and `longevity`. Both are natural fits and near-zero competition, but the app currently shows them as "Not measured" and the PRD punted community-voted scores to v2. Ranking for something the app does not deliver earns a bad first session. **Revisit when longevity and sillage ship**, there are 11 spare bytes waiting.

**The 11 spare bytes are intentional.** Keyword changes need a version submission, so they are cheap to make alongside any update but not on their own. Leave room to react to whatever the first month of search data shows.

### Description — 4,000 chars · NOT indexed by Apple search, so this is conversion copy, not ASO
```
Point your camera at the label. Spritz reads it, finds the bottle, and puts the whole thing on one screen. What's in it, who made it, and how it actually wears.

No typing a half-remembered name into a search box. No stitching an answer together from five tabs.


WHAT YOU GET ON EVERY FRAGRANCE

The notes, laid out properly. Top, heart and base, so you can see how a scent is built instead of reading a list. Tap any note to find out what it actually smells like.

The families it belongs to, and the ones it borrows from.

The concentration, explained. What eau de parfum actually means for how long it lasts and how far it carries.

How it wears through the day, in plain language rather than numbers.


BUILD A SHELF

Save anything to Own, Tried or Wishlist in a tap. Your collection stays yours, sorted and searchable, and the more you add the better Spritz gets at pointing you toward the next one.


BROWSE WHEN YOU DON'T HAVE A BOTTLE IN FRONT OF YOU

Eighteen families to work through, from citrus and floral to leather and gourmand. Over 10,000 fragrances. Search by name, house or note when you already know what you are looking for.


SPRITZ PRO

Free covers the essentials. Unlimited scanning, the notes breakdown, family tags, and a collection of up to 25 bottles.

Pro opens the rest:

The perfumer behind the fragrance, and the story of the house that made it
Every note's flavor profile, so an unfamiliar pyramid stops being a wall of words
A synthesized read on what people who actually wear it say
Dupes for any fragrance, generated on demand
An unlimited collection


Spritz is built for the moment you pick up a bottle and want a real answer. Not a shopping list. Not a forum thread from 2019. The bottle in your hand, explained properly.
```
1760 / 4,000. Positioning per D9: encyclopedia leads, dupes named honestly as one Pro unlock rather than a headline. Deliberately does not repeat the promotional text, which renders directly above it. Names no other brands and no data sources, per Apple's metadata rules on trademarks.

### Support URL — required
```
https://spritzofficial.app/support
```
Built 2026-09-01. Covers scan failures, missing fragrances, collections, Pro billing (including the "cancel where you subscribed" rule), data rights, and the contact address.

### Account deletion URL — required by Google Play as a standalone public page
```
https://spritzofficial.app/support/delete-account
```
Built 2026-09-01. Reachable with no app installed and no sign-in, which is Play's requirement. Lists exactly what is deleted, what is retained and why, the 30-day timeline, and that store subscriptions must be cancelled separately. This is the URL to paste into Play's Data safety form.

Apple's separate requirement under Guideline 5.1.1(v) is an **in-app** deletion path. That is still slice 4 and is NOT satisfied by this page.

### Support contact address
```
josh.knight@spritzofficial.online
```
Used on both support pages and all three legal documents via `LEGAL_CONTACT` in `app/legal/constants.ts`. Must be a monitored mailbox: App Review emails the support address, and a bounce is a rejection cause.

### Marketing URL — optional
```
https://spritzofficial.app
```

### Copyright — 200 chars
```
TBD — typically "2026 <legal name>".
```

---

## Google Play

Play's fields differ, so these are not a copy-paste of the above.

### App name — 30 chars
```
TBD — "Spritz: Fragrance Guide" is available here too unless taken.
```

### Short description — 80 chars
```
TBD
```
Play's rough equivalent of the subtitle, but 80 characters rather than 30, and it IS indexed.

### Full description — 4,000 chars · indexed by Play, unlike Apple's
```
TBD — can reuse the Apple description as a base, but Play indexes this text, so it should carry keywords naturally where Apple's does not.
```

### Developer name
```
Spritz
```
Editable later, unlike Apple's. Set deliberately at registration, not left as a default.

---

## Rules that shaped these

- Apple indexes name, subtitle, keywords and category. It does **not** index promotional text or description.
- Play indexes the title, short description and full description.
- Apple now also generates LLM-based app tags from your submitted metadata, so consistency across fields matters more than it used to.
- No specific prices in previews or screenshots. Prices vary by region and cannot be kept accurate.
