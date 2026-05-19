# Spritz Editorial

The original written content layer of Spritz. Three content types, each in its own folder, each authored as Markdown with YAML frontmatter:

```
editorial/
├── notes/         (~500 entries — what each note actually smells like)
├── houses/        (~100 entries — brand profile + ~100-word history)
└── fragrances/    (~500 entries — perfumer's intent + how to wear)
```

This content is **the moat**. Fragrantica gives us notes and scores. Editorial gives us *understanding*. The scraper handles the data layer; this folder handles the voice.

---

## Why this exists separately

The PRD positions Spritz as an encyclopedia, not a dupe-finder. The encyclopedia is only as good as the content inside it. Fragrantica's note pyramid says "this fragrance has bergamot in it" — Spritz needs to also tell you *what bergamot smells like*, *who Tom Ford is*, and *when you should reach for Tobacco Vanille over Tobacco Oud.*

Original editorial content also gives Spritz a **defensible content moat** that isn't scraped. If Fragrantica issues a takedown tomorrow, the editorial layer still works. The notes/scores layer is replaceable; the voice isn't.

---

## The Spritz editorial voice

Five rules. Read these before writing anything.

### 1. Confident, knowledgeable, never snobby
Write like a friend who happens to know everything about fragrance — not like a Sephora associate, not like a perfume blogger doing brand work. The reader is curious and intelligent. They don't need to be sold to or talked down to.

> ✅ "Bergamot is the bright, sharp citrus that opens half the cologne ever made. Smell Earl Grey tea — that's bergamot."
>
> ❌ "The exquisite, luxurious essence of bergamot envelops the senses with its enchanting citrus aura."

### 2. Specific over evocative
Sensory comparisons beat poetic gestures. "Smells like crushed mint stems" tells the reader something. "A symphony of green freshness" tells them nothing.

> ✅ "Oud smells like an old leather couch in a damp room — and that is, somehow, exactly the point."
>
> ❌ "Oud unfolds with a mysterious, intoxicating depth that defies description."

### 3. Length matches purpose
- **Note descriptions:** 1–2 sentences. ~30 words. The reader is tapping a chip; respect their time.
- **House histories:** ~100 words. One paragraph. Founded when, by whom, what they're known for, current creative direction.
- **Fragrance editorials:** 60–120 words. The perfumer's intent + when to wear it + a single observation that you can only get from someone who's actually smelled it.

### 4. No clichés
Banned vocabulary: *exquisite, luxurious, captivating, enchanting, sophisticated, elegant, mysterious, intoxicating, sensual, alluring, timeless, journey, symphony, masterpiece, ode to, evocative*. If you catch yourself reaching for one, the sentence isn't done yet.

### 5. Tell the truth
If a fragrance is hyped but mid, say it tactfully. If a perfumer made one masterpiece and a lot of duds, the entry on the masterpiece can mention it. Spritz's authority comes from being trustworthy, not from being flattering.

> ✅ "Aventus is the most-imitated fragrance of the last fifteen years. The original is genuinely good — bright, smoky, confident — though batch variation is a real and well-documented frustration."
>
> ❌ "Aventus is the legendary masterpiece that defined a generation."

---

## Content format

Every file is Markdown with YAML frontmatter. The frontmatter is the structured data; the Markdown body is the prose.

### Notes (`notes/<note-name>.md`)

```markdown
---
name: bergamot
type: note
aliases: [italian bergamot, bergamot oil, bergamot peel]
family: citrus
---

The bright, sharp citrus that opens roughly half of all colognes ever made.
Smell Earl Grey tea — that's bergamot. Lighter and more bitter than orange,
greener than lemon. Volatile: shines in the first ten minutes, gone by hour two.
```

- `name` (required): the canonical, lowercase form
- `aliases` (optional): variants that should map to this entry during normalization
- `family` (optional): citrus / floral / woody / amber / etc. Free-text.
- Body: 1–2 sentences. ~30 words.

### Houses (`houses/<house-slug>.md`)

```markdown
---
name: Tom Ford
slug: tom-ford
founded: 2006
founder: Tom Ford
country: United States
website: https://www.tomfordbeauty.com/
---

Tom Ford launched his eponymous fragrance line in 2006 after building his
fashion brand from the ashes of his Gucci tenure. The line is split into two
halves: the mainline (Black Orchid, Noir, Tuscan Leather), built for retail
visibility, and the Private Blend collection (Tobacco Vanille, Oud Wood,
Tuscan Leather Intense), which is where the more interesting work lives.
The brand's house style is loud, confident, and unapologetically expensive —
the olfactory equivalent of a velvet smoking jacket.
```

- `name`, `slug` (required): display name + URL-safe key
- `founded`, `founder`, `country`, `website` (optional)
- Body: ~100 words. One paragraph. Founded when/by whom + what they're known for + current direction.

### Fragrances (`fragrances/<house-slug>--<fragrance-slug>.md`)

```markdown
---
name: Tobacco Vanille
house: Tom Ford
slug: tom-ford--tobacco-vanille
year: 2007
perfumer: Olivier Gillotin
how_to_wear:
  occasions: [evening, cold weather, intimate settings]
  short: A cold-weather evening fragrance. Wear it sparingly — one spray, not three.
  layering_notes: Pairs well with leather and rosewood notes. Avoid layering with anything sweet.
---

Tobacco Vanille is the fragrance that turned the Private Blend line into a
cultural force. Olivier Gillotin built it around a literal pipe-tobacco accord
softened with vanilla and dried fruit — a smell that reads as "warm, sweet,
adult" and that performs harder than you'd expect. The famous criticism is
that it's a one-note fragrance, and that's not wrong, but the note is so
well-constructed that nobody who likes Tobacco Vanille seems to mind.
Two sprays will fill a room. One is plenty.
```

- `name`, `house`, `slug` (required)
- `year`, `perfumer` (optional but encouraged)
- `how_to_wear` (optional structured object): `occasions`, `short`, `layering_notes`
- Body: 60–120 words. Perfumer's intent + when to wear + one specific observation.

---

## How to add content

1. **Pick a target.** The top 500 fragrances by popularity is the v1 goal. Use the queue from the scraper (`/scraper/data/queue.json`) to prioritize.
2. **Check for prior art.** Look in `notes/`, `houses/`, `fragrances/` — most fragrances reuse 5–10 notes that already have entries.
3. **Write the missing pieces.**
   - If a note doesn't have a description yet, write one.
   - If the house doesn't have a profile yet, write one.
   - Then write the fragrance editorial.
4. **Validate.** `npm run validate` — checks frontmatter schema, flags missing required fields, reports coverage stats.
5. **Ingest.** `npm run ingest:dry` first to see what would change, then `npm run ingest` to push to Supabase.

---

## Setup + run

```bash
cd editorial
npm install
cp .env.example .env
# Fill in Supabase URL + service-role key (same as scraper/.env)

# Validate everything
npm run validate

# Push to Supabase (dry-run first)
npm run ingest:dry
npm run ingest
```

---

## Coverage targets

| Content type | v1 target | v1.5 target | v2 target |
|---|---|---|---|
| Notes | ~100 entries (covers 90% of mentions in top-500) | ~250 | ~500 (full canonical dictionary) |
| Houses | ~30 entries (covers top-500's brand spread) | ~75 | ~150 |
| Fragrances | ~50 entries (the absolute classics, halo content) | ~250 | ~500 |

The starter set in this repo is the seed (~40 notes, ~10 houses, ~6 fragrances). It's enough to lock the voice and validate the ingestion pipeline. Expanding it is the v1.5 work.

---

## Sourcing for content beyond first-hand experience

Some entries — historical houses, perfumers, vintage fragrances — require research. Acceptable sources:

- **Original interviews / reviews you've read** — fine, write in your own words.
- **Wikipedia** — fine for facts (founding date, perfumer credits). Don't quote it. If a sentence reads like a Wikipedia paraphrase, rewrite it in the Spritz voice.
- **Fragrantica community reviews** — fine for *understanding* a fragrance's reputation, off-limits for direct copying.
- **Brand websites** — fine for facts (year, country, founder). Off-limits for marketing copy.
- **AI drafts** — acceptable starting point, **mandatory human review and rewrite**. AI drafts everything sound the same; the editorial voice is the differentiator. If it sounds like a press release, redo it.
