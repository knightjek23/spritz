# Spritz, portfolio blocks

Paste-ready sections for Framer. Each block is standalone. Character counts are there because Framer sections have real length limits and you're pasting by hand.

Blocks are ordered as they'd appear on the page.

---

## BLOCK 01: Hero eyebrow
*Where: small text above the project title*
*Chars: 38*

```
Product, design, and AI-directed build
```

---

## BLOCK 02: Hero title
*Where: page H1*
*Chars: 6*

```
Spritz
```

---

## BLOCK 03: Hero subtitle
*Where: under the H1*
*Chars: 133*

```
Point your camera at a fragrance bottle and find out what's actually in it. Notes, perfumer, longevity, and how to wear it. One page.
```

---

## BLOCK 04: Meta strip
*Where: the row of labeled facts under the hero*

```
Role: Product, design, architecture, AI direction. Solo build.
Stack: Next.js 14 · Supabase · Clerk · Stripe · GPT-4o vision · Vercel
Built: Spec April 2026, first commit May 18, launched August
Live: spritzofficial.app
Code: github.com/knightjek23/spritz
```

---

## BLOCK 05: Problem
*Where: first content section*
*Chars: 635*

```
Fragrance people spend a weirdly large amount of time on one repeated task: picking up a bottle and trying to work out what it actually is. What's in it, how long it lasts, who composed it, whether the hype is real.

Today that means screenshotting the bottle, typing the name into Fragrantica's desktop wiki on your phone, scrolling past ads, and stitching the perfumer credit, the longevity scores, the house history, and the community verdict together across four or five tabs. It's a mobile-hostile workflow for a community that lives on TikTok and Reddit.

I wanted that to collapse into one action. Point camera, know the bottle.
```

---

## BLOCK 06: Constraints list
*Where: bulleted section, "What I decided before I wrote a single prompt"*

```
• Not a dupe finder. The original braindump was a "find the cheaper alternative" app. I killed that framing in April.
• No social layer, no taste profile. Both need data I don't have on day one.
• PWA, not native. An app store in v1 doubles the surface area before I know anyone wants it.
• Top 10,000 fragrances, not a complete catalog. The long tail gets filled reactively.
• The data layer has to be swappable. I bootstrapped by scraping, so the source is a liability, not a foundation.
• Two-layer scanning, and no bottle-shape recognition. Ruled out in the spec before anyone could build it.
```

*Optional pull-quote under the list, chars: 53*

```
A constraint is only useful if it rules something out.
```

---

## BLOCK 07: Architecture intro
*Where: section lead-in above the stack table*
*Chars: 389*

```
Next.js 14 on Vercel because the product is a set of shareable, crawlable pages and I wanted server rendering without running servers. Supabase for Postgres plus row-level security, so authorization lives in the database instead of scattered through route handlers I'd have to keep re-verifying. Clerk for auth because session handling is the kind of thing I don't want in my own codebase.
```

---

## BLOCK 08: Stack table
*Where: two-column table or card grid*

```
Next.js 14 (App Router) | Server rendering for crawlable, shareable pages without running servers
Supabase / Postgres | Authorization in the database via RLS, not scattered through route handlers
Clerk | Session handling I don't want to own
GPT-4o vision | Reads the bottle label, and disambiguates visually only when text is ambiguous
Stripe + RevenueCat | Web and native billing converging on one entitlement flag
Playwright | Private catalog scraper, isolated as its own package
Vercel | Deploy target, with a prebuild guard that blocks a known crash class
```

---

## BLOCK 09: Decision callouts
*Where: pull-quote or highlighted card, one per decision*

```
Scanning is OCR plus text matching, not image recognition. I rejected pure visual matching because Sauvage and Sauvage Elixir are the same bottle in different colors, and no embedding model saves you there.
```

```
Similarity is precomputed, not scored at request time. 70% cosine on the note vector, 20% Jaccard on family tags, 10% on season. A nightly job writes the top 50 per fragrance to a table and the page just reads rows.
```

```
Rate limiting runs on Postgres, not Redis. Wrong answer at scale, right answer at zero users. The file says to swap it for Upstash if query volume ever matters, which I'd rather leave written down than pretend I made a permanent decision.
```

---

## BLOCK 10: Direction section
*Where: "How I directed the AI"*
*Chars: 977*

```
The PRD is the source of truth and the code cites it. Files open with comments like "// Scan rate limiting. PRD §7." and the dupe engine names the section its formula comes from. That's not decoration. When a build runs for three months the thing that kills you is drift, and a numbered spec the implementation points back to is the cheapest anchor I've found. If a file can't name the section it's implementing, that's a signal I never actually decided what it was for.

Everything credential-gated became a runbook instead of a prompt. If a step needs my hands on a dashboard, it gets written down as an ordered procedure with the failure modes attached, and it does not get faked in code.

I was deliberate about what stayed out. When I scaffolded the native app track, I kept the purchase code out of the web build entirely and parked it in the runbook, since a native-only import in the Next.js tree would break the Vercel deploy for a feature that doesn't even run there.
```

---

## BLOCK 11: Prompt excerpt
*Where: code block or quote card. This is a real comment from the repo.*

```
// Build-time guard: any Server Component (no "use client" directive at
// the top) that contains an onClick handler crashes at request time with:
//
//   "Event handlers cannot be passed to Client Component props."
//
// (Burned by this once on /family/[slug] — error digest 1930472941.)
```

---

## BLOCK 12: Caught-and-changed table
*Where: three-column table, the credibility section*

```
What came back | Why it was wrong | What I did
An onClick handler inside a Server Component | React can't serialize functions across the server boundary, so it 500s at request time. Vercel returns a digest hash and nothing useful client-side. Production was broken and the browser told me nothing. | Fixed it, then wrote a prebuild script that walks app/ and components/, decides server vs client from the directive, and fails the build if a server file contains onClick. It can't reach production again.
A rate limiter that failed open | On any database error it returned "allowed." The scan endpoint is public and each call costs real OpenAI money, so anyone who could induce DB errors got uncapped spend on my card. | Fail closed for anonymous requests, fail open for signed-in ones since they're already capped by account. Added a global daily ceiling so IP rotation can't route around it.
Em dashes everywhere | In the generated UI copy, the editorial content, and the output of my own AI features. It's the most obvious tell that a human didn't write something, and it was leaking into the product. | Swept them out, added the rule to the system prompts, then wrote a stripper function anyway because the model does it regardless of what you tell it.
A scraper import path that silently destroyed a backfill | The full pipeline rewrites popularity_rank from queue order. Adding three fragrances the obvious way would have flattened all 7,100 ranks I'd spent a run computing. | Wrote a surgical importer that matches on source URL, updates in place, and never touches the popularity columns.
Save buttons that didn't work, and a Pro upsell with no unlock flow | Found in the first moderated user test, not by me and not by any audit. The participant couldn't complete the save task, and she read the whole Pro pitch and had nowhere to click. | Top of the bug list before the next session. Burning a second participant on the same dead end costs you everything they'd have said after it.
```

*Optional closing line under the table, chars: 222*

```
And the part that makes the rest of this honest: plenty of it I kept. The scoring math, the payload validation, the trigram search, most of the component layer. When the first pass beat what I'd have written cold, I left it alone.
```

---

## BLOCK 13: Design
*Where: design section lead, above screenshots*
*Chars: 662*

```
I threw out the entire visual system halfway through. The April direction was the current consumer-startup look: near-white base, electric blue, acid yellow. It was fine, and it looked like everything else. Fragrance trades on craft and heritage, and a landing page styled like a fintech dashboard was fighting the product.

The replacement is Playfair Display over Roboto on a warm cream base, deep forest emerald for brand and CTAs, brass for saved states. I lifted the surface color from #E8E1D4 to #F0EADE specifically so the secondary text tone clears WCAG AA at 4.55:1, because the nicer beige failed and I'm not shipping a palette I have to apologize for.
```

---

## BLOCK 14: Outcome
*Where: near the bottom*
*Chars: 386*

```
Live at spritzofficial.app and launched. Around 7,100 fragrances, each with notes, family and season tags, longevity and sillage, and a popularity rank, plus hand-written editorial on 21 of the most famous fragrances. Pro at $4.99 monthly, $29.99 annual, or $89 once. Twenty-one migrations, fifteen API routes, 31 components, 124 commits between May 18 and the first week of August.
```

*[TODO: add a measured line here if you have one. Signups, scans, conversion. Leave it out rather than soften it.]*

---

## BLOCK 15: What I'd change
*Where: closing section*
*Chars: 872*

```
I shipped the free trial on the wrong plan and had to reverse it. Seven days free on the annual plan converts into a surprise $29.99 charge, which is a refund request and a bad review wearing a growth tactic's clothing. I moved it to monthly, where the worst case if someone forgets is $4.99. Right call, and I should have made it before it was live.

I hand-rolled the Supabase type definitions instead of generating them. It's cost me real time twice, because a type that doesn't match the schema doesn't fail loudly, it just resolves your query to "never" and lets you find out later. That's the debt I knowingly took on and it's still there.

One user test is not user testing. That session was the highest-value hour of the project, and it also told me the thing she'd pay for was dupes and TikTok trends, which is the positioning I deliberately walked away from.
```

---

## BLOCK 16: Card blurb
*Where: the project card on the portfolio index*
*Chars: 116*

```
Scan a fragrance bottle, get the whole story. Solo build: 7,100-fragrance catalog, GPT-4o vision, live and launched.
```
