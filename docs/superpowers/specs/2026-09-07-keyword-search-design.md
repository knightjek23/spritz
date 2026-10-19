# Keyword search: notes and families in the search bar

**Status:** built, awaiting the migration and a live check.
**Decisions (Josh, 2026-09-07):** auto-detect and show both sections; rank by number of terms matched, then popularity.
**Ships as:** web only (Vercel). No native rebuild.

## What it does

Typing "musk, iris, citrus" (or "musk iris citrus", "pink pepper and oud", "woody + amber") into the search bar shows a **Most popular with musk · iris · Citrus** section above the usual name matches: the fragrances that carry those notes or sit in those families, ordered by how many of the terms they match, then by `popularity_rank` (the same index the note and family pages use). Each row shows `2/3` in the dropdown and matched/unmatched term chips on `/search`.

A query is a keyword query only when every part of it is a known note or family. "rose" qualifies (so both sections show); "dior sauvage" and "musk, dior" do not and stay plain name searches.

## Resolution (`lib/search-terms.ts`)

- Split on `, ; + & / and`. A chunk that resolves whole is one term ("pink pepper"); otherwise it splits on spaces and every word must resolve.
- A word is a **note** if it is a catalog note name (`list_canonical_notes`, cached in-process for an hour), an editorial note name/alias (`editorial/notes/*.md`), or a `NOTE_ALIASES` key or value. Notes win over families for words that are both ("iris", "rose", "vanilla").
- Otherwise a **family** if `normalizeFamily()` knows it, with a light stem for "citrusy"/"musky".
- Up to 6 terms. Labels come back normalized ("vanila" → vanilla, "agarwood" → oud).

## Matching (`find_fragrances_by_terms`, migration 0029)

A fragrance matches a note term when any note in any layer equals one of the term's alias names, or contains the typed word as a whole word ("musk" also finds "white musk", not "muskrat"). A family term matches when any accord normalizes to that family, or a note carries the family word. Score = distinct terms matched. Order: score desc, `popularity_rank` asc nulls last, name. No new index; 7k rows scan in well under 100ms.

## API and UI

`GET /api/search?q=` now returns `{ results, terms, byTerms }`; `terms` is null for name searches. `&full=1` raises the keyword limit from 8 (dropdown) to 40 (`/search`). Both queries run in parallel; a keyword failure never takes the name search down. CDN caching unchanged.

Dropdown: when keyword results exist, 5 keyword rows under a "Most popular with …" header, then up to 3 name rows under "Fragrances", one keyboard list. `/search`: keyword section with term chips, then name matches, and the empty state now suggests notes.

## To go live

1. `npm run db:migrate` (applies 0029).
2. Push; Vercel deploys.
3. Check on the site: "musk, iris, citrus", "rose", "pink pepper and oud", "dior sauvage" (name only).

## Verified before push

- Migration exercised on a local Postgres 16 with a stub `fragrances` table: ranking, word boundaries, exact multi-word notes, family matches all behaved.
- Resolver exercised against the repo's editorial notes and alias table with 15 queries (see build log).
- Dropdown rendered headless from the real component with a stubbed API: two sections, one keyboard list, Enter on the third row navigates to the third row.

## Follow-ups (not in this pass)

- Recent-search rows could show the resolved term labels.
- A `note_index` table if keyword search gets heavy use (0005 deferred it).
