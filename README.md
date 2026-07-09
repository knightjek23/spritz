# Spritz

Scan a cologne bottle → know everything about it. Notes pyramid, perfumer, longevity, sillage, season guidance, brand history, all on one mobile-first encyclopedia page.

See [`Spritz_PRD_v1.md`](./Spritz_PRD_v1.md) for the full v1 product spec, [`SETUP.md`](./SETUP.md) for the Day 1 deploy runbook.

---

## Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router, PWA) |
| Backend / DB | Supabase (Postgres + pgvector) |
| Auth | Clerk |
| Payments | Stripe |
| Hosting | Vercel |
| Vision | GPT-4o vision (primary) + Google Vision (fallback) |
| Scraper | Playwright (private, runs separately — see `/scraper`) |

## Visual identity

- **Type:** Playfair Display (display / headings) + Roboto (body, small, metadata)
- **Base:** Cream / paper tones (see `tailwind.config.ts` for the token set)
- **Primary:** Emerald `#1F3F2E` (CTAs, brand, theme color)
- **Accents:** Brass (saved states, badges), Burgundy (errors)
- **Type colors:** Ink + Slate

Full reference: `Spritz_Design_System.html`.

## Getting started

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env.local
# Fill in Supabase, Clerk, Stripe, OpenAI keys per SETUP.md

# 3. DB schema
npx supabase login
npx supabase link --project-ref <your-project>
npx supabase db push

# 4. Dev server
npm run dev
# → http://localhost:3000
```

## Project structure

```
app/                      Next.js App Router
  scan/                   Camera capture + scan flow
  search/                 Manual search fallback
  fragrance/[id]/         Encyclopedia detail page (notes, perfumer, history, similar)
  collection/             Own / Tried / Wishlist
  pricing/                Pro upgrade
  sign-in, sign-up/       Clerk auth
  api/
    scan/                 POST: image → vision OCR → DB lookup
    search/               GET: text query → ranked matches
    dupes/[id]/           GET: similar fragrances (internal name kept; UI says "Similar")
    collection/           CRUD: user's saved fragrances
    buy/[id]/             302 redirect with affiliate tag
    stripe/checkout/      POST: create Pro checkout session
    webhooks/stripe/      Stripe events → update plan
    webhooks/clerk/       Clerk events → mirror users table

components/               Shared UI
lib/
  supabase/               browser + server + admin clients
  stripe.ts               Stripe SDK init
  vision.ts               GPT-4o + Google Vision adapters
  dupe-engine.ts          Similarity math (cosine + jaccard) — powers "Similar fragrances"
  affiliate.ts            Retailer pick + URL builder
  rate-limit.ts           Per-IP / per-user scan throttle
  types.ts                Shared TS types

middleware.ts             Clerk auth middleware

supabase/
  migrations/             SQL schema (PRD §9)

scraper/                  Playwright scraper — SEPARATE PROJECT
                          Runs locally / on private VPS, NEVER on Vercel.
                          Has its own package.json. See scraper/README.md.
```

## Build order (PRD §16 — 14-day plan)

- ✅ Day 1: Repo scaffold, deploy hello-world to Vercel, apply to affiliate programs
- ⬜ Day 2: Playwright scraper + parser → Supabase (top 10k fragrances + encyclopedia content)
- ⬜ Day 3: Vision spike (GPT-4o vs Google) + `/api/scan` + encyclopedia content scrape
- ⬜ Day 4: Search/lookup API
- ⬜ Day 5: Similarity engine
- ⬜ Day 6: Mobile UI scan flow
- ⬜ Day 7: Encyclopedia detail page
- ⬜ Day 8: Collection + opt-in similar fragrances section
- ⬜ Day 9: Auth + Stripe (Pro gates encyclopedia depth)
- ⬜ Day 10: Affiliate integration (to scanned fragrance only)
- ⬜ Day 11: Polish + PWA
- ⬜ Day 12: QA + real-bottle accuracy testing
- ⬜ Day 13: Analytics
- ⬜ Day 14: Soft launch

## Open questions blocking the build

See PRD §15. Short list:
- **Q1** GPT-4o vs Google Vision — Day 3 spike
- **Q2** Where does perfumer + house history come from? Wikipedia? Original editorial?
- **Q4** Affiliate program approvals — apply Day 1
- **Q9** ToS / Privacy Policy

## Data note

Bootstrap DB is scraped from Fragrantica. Their ToS prohibits this. Standard hygiene:
1. Scraper is a separate, private repo/project — never public.
2. App UI does not credit Fragrantica or link back.
3. Data layer is abstracted — `FragranceRepository` interface so the source is swappable.
4. If contacted, freeze scraping immediately and accelerate community-contribution flow.

For encyclopedia content (perfumer, house history, note descriptions), recommend original editorial work for the smallest content set (note flavor descriptions, ~500 entries). Gives Spritz a defensible content moat that's not scraped from anyone. See PRD §15 Q2.
