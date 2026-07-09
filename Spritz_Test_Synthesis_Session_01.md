# Spritz user test synthesis: Session 01

**Participant profile:** Collector, female. Learns about new fragrances from friends or by asking strangers in public when she smells something she likes. Two regret stories: bought popular fragrance untested and disliked it; loved one in store, lost interest after frequent wear.

**Caveat upfront:** n=1. Treat everything below as a strong signal worth investigating, not as a settled finding. Validate against Sessions 02 and 03 before acting on the bigger judgment calls.

---

## The five things that matter most

Ranked by impact, not by what the participant talked about most.

### 1. Spritz IS what she said she was missing, and she didn't realize it

Question 12 asked what she expected to be in the app that wasn't. Her answer: **"An encyclopedia of different perfumes/colognes to browse/learn about."** That is verbatim the product's positioning, sitting in front of her the entire session. She didn't recognize it.

Her one-sentence pitch in Q15 also describes the encyclopedia exactly: "A deep dive into scents you already have smelt/owned and could learn more about the notes in them."

So the depth is right, but the home page is reading as "scan tool" first. The encyclopedia framing is buried. This is the highest-leverage fix in this report: rework the home so "the fragrance encyclopedia" is the dominant pitch and scanning is one entry point into it, not the whole product.

**Action:** Rewrite the hero on the marketing home. The current "Know what you're wearing" + "Scan a bottle" puts scanning on a pedestal. Try leading with browse/learn ("Every fragrance, broken down") with scan as one of three entries (scan, search, browse families).

### 2. Two flat-out broken features that blocked tasks

These are bugs, not opinions:

- **Owned / Tried / Wishlist buttons on the fragrance detail page did not function.** Task D ("save something for later") could not complete.
- **"Unlock with Pro" did not lead to a working unlock flow.** She read the full Pro pitch, was interested, could not act on it.

**Action:** Top of the bug list. Fix before next session or you'll burn another participant on the same dead ends and miss the rest of their feedback.

### 3. Notes glossary is the single biggest content gap

Task C confidence rating: **3 out of 5.** Reason: "Some of these words they've never heard of, don't know what certain notes smell like."

This isn't a UX problem, it's a content problem. The notes pyramid is the heart of the fragrance detail page, and for any user who isn't already a perfumer, undefined note names ("hedione," "iso e super," "ambroxan") are walls. She tapped Fruity in the families list and wanted a pop-up explaining what Fruity means. Same instinct.

**Action:** Two threads. (a) Finish the note flavor-profile descriptions for at least the top 80 notes that appear most often in the catalog. (b) Add inline tap-to-reveal definitions on the fragrance detail page so users don't have to leave to learn what a note is.

### 4. She would pay, with one specific condition

Q13 answer: **yes, $5/mo is the right price, AND** she anchored value on celebrity / TikTok / Instagram fragrances + dupes. Quote: *"Dupes are a huge player in the $5 range, great value."*

This is a real tension with the locked positioning. The product was deliberately pivoted away from dupe-first framing (April 22) toward encyclopedia-first. But Pro conversion in her head was driven by "what's TikTok wearing + where can I get the cheap version." That's the dupe finder positioning the PRD walked away from.

You don't have to abandon the pivot. But two things to consider:
- **Dupes need to be higher in the fragrance detail page.** She explicitly asked for this. Move the Known Dupes section above Notes Pyramid, or at least above the long editorial commentary.
- **A "trending" or "what's everyone wearing" surface might be worth piloting.** Doesn't have to be TikTok-branded. A simple "most scanned this week" + "rising" list connects to the cultural-moment instinct without diluting the encyclopedia positioning.

### 5. The target audience picture got more interesting

When asked who would use Spritz (Q14), she named **her brother and her mom**: people who get cologne as gifts but want to start buying their own and have no idea where to begin. **Beginners**, not collectors.

That's actually a more attractive segment than the collector she described herself as. Beginners convert faster (no entrenched preferences), gift-buying drives natural seasonal demand, and the encyclopedia framing solves a real "I don't know where to start" pain. Her collector identity makes her a good critic; her beginner-adjacent recommendations may be the real ICP.

**Action:** Don't change the PRD yet. Do prioritize beginner-friendly onboarding in the next two iterations: simpler language, more "what does this even smell like" explanations, fewer perfumer-credit details on the first paint.

---

## Other themes worth tracking

**Information architecture confusion**
- Families vs Notes felt overlapping. "Can't expand the family option" — wanted to drill into Fruity and didn't see how. Family entries on /families do open detail pages, but the tap target may not look interactive enough.
- Pop-up / lightbox explanations for families would match her mental model.
- Suggested accordion-style collapse on fragrance detail page so she can skip to dupes faster.

**Catalog gaps blocked exploration**
- Fragrances she tried to look up "weren't available in the system yet." (Q11)
- This is the recurring catalog-completeness problem and Session 02 will hit the same wall unless coverage improves.

**Missing features she asked for**
- Multi-note search ("show me fragrances with these notes")
- Longevity ratings (planned for v1.5 per PRD)
- Where to buy near me + sale alerts (would require maps + retailer pricing integrations)

**Aesthetic signal**
- "Feels very matte. Perfume websites give more misty feel, this seems more formal."
- This is one person's read but worth noting. The boutique-editorial palette is intentional restraint; perfume marketing leans atmospheric and luxurious. Not necessarily a problem, but if multiple participants land here, it's a brand-positioning conversation, not a small visual tweak.

**What she actively liked**
- Home screen simplicity ("not too many options")
- The matches surfaced at the bottom of detail pages (similar fragrances)
- The quote at the bottom of the home page
- Read all of the Pro subscription content end-to-end (she was interested, you didn't bury the lede on pricing)

---

## Quotes worth remembering

> "Some of these words they've never heard of, don't know what certain notes smell like." (3/5 confidence on Task C, identifying the notes glossary gap)

> "An encyclopedia of different perfumes/colognes to browse/learn about." (What she expected to find. The product literally is this. Positioning gap.)

> "Dupes are a huge player in the $5 range, great value." (The Pro conversion lever, even though it cuts against the locked positioning.)

> "Feels very matte. Perfume websites give more misty feel, this seems more formal." (Brand aesthetic read.)

---

## Open questions for Session 02 and 03

Things to specifically probe in the next sessions to test or validate this session's signals:

1. **Without prompting**, does the home page read as "scan tool" or "fragrance encyclopedia"? (Validates Finding 1.)
2. Does the next participant also want dupes higher in the hierarchy? (Validates Finding 4 against the locked positioning.)
3. Does the next participant also name beginners as the natural users, or are they themselves the user? (Validates Finding 5.)
4. Does the "matte vs misty" aesthetic note repeat, or was it idiosyncratic?
5. What do beginners look up first if you don't give them a bottle? Does the families browse path work for them?

---

## Punch list out of this session

**Fix this week (bugs):**
- Owned / Tried / Wishlist collection buttons on fragrance detail page
- "Unlock with Pro" checkout flow

**Fix next sprint (content + IA):**
- Notes glossary: descriptions for the top 80 notes
- Inline tap-to-reveal note definitions on fragrance detail
- Family pages: make tap targets feel more clickable, surface descriptions sooner
- Move Known Dupes section higher on fragrance detail page

**Test/iterate (positioning):**
- Rewrite the home hero to lead with encyclopedia over scan
- Pilot a "trending" or "rising scans" surface
- Add beginner-leaning copy and a "where do I start" entry point to the home

**Watch and validate (don't act on n=1):**
- Catalog completeness as a positioning problem, not just a content problem
- Aesthetic "matte vs misty" feedback
- Whether the encyclopedia-first pivot loses too much of the dupe-finder conversion lever

---

## Note on synthesis next round

After Session 02, run the same findings structure and look for overlap with this one. Patterns that show up twice graduate from "investigate" to "fix." Patterns mentioned by only one person stay on the watch list until a third session.

If you want, I can compare Session 02 against this one and produce a delta when you're ready.
