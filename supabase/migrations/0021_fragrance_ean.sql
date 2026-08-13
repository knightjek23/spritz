-- Barcode (GTIN) for catalog rows, learned from affiliate product feeds.
--
-- Why this exists: the two largest fragrance catalogs reachable on Awin are
-- Douglas_DE (~140k articles) and Flaconi DE (~50k), and both ship GERMAN
-- product titles. scraper/src/backfill-affiliate-images.ts matches feed rows
-- to catalog rows on normalized house + name with English concentration words
-- stripped ("eau", "de", "parfum", "homme", "femme"), which collapses against
-- German titles. Matching on a barcode sidesteps language entirely.
--
-- The catalog is scraped from a reference site that publishes no barcodes, so
-- this column starts empty. It gets populated the other way round: when the
-- backfill matches a row by NAME against an English-language feed (allbeauty,
-- Fragrancedirect, Perfume Click) it writes that product's GTIN here. A later
-- run against a German feed then matches on GTIN and never touches the title.
--
-- Stored NORMALIZED TO GTIN-14 (left-padded with zeros) so a US feed's UPC-12
-- and an EU feed's EAN-13 for the same product resolve to the same key. Check
-- digits are validated before writing: Awin explicitly does not validate EAN,
-- UPC or GTIN, and advertisers routinely export empties, "0", "N/A", and
-- Excel-truncated leading zeros.
--
-- Not unique: flankers and sizes legitimately share a catalog row here, and a
-- bad feed could otherwise wedge the whole backfill on a constraint violation.

alter table public.fragrances
  add column if not exists ean text;

comment on column public.fragrances.ean is
  'GTIN-14 normalized barcode, learned from affiliate product feeds. Used to match feed rows in languages the name matcher cannot parse. Nullable, non-unique, check-digit validated at write time.';

-- Partial index: the lookup is always "find the row for this barcode", and
-- most rows will stay null for a long time.
create index if not exists fragrances_ean_idx
  on public.fragrances (ean)
  where ean is not null;
