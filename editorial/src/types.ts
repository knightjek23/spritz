// Editorial content types — mirror the frontmatter shape of each .md file.

import { z } from "zod";

export const NoteFrontmatter = z.object({
  name: z.string().min(1),
  type: z.literal("note"),
  aliases: z.array(z.string()).optional().default([]),
  family: z.string().optional(),
});

export const HouseFrontmatter = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  founded: z.union([z.number(), z.string()]).optional(),
  founder: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url().optional(),
});

export const WearGuidance = z.object({
  occasions: z.array(z.string()).optional(),
  // Renamed from `short` → `how_to_wear` to match the database column shape
  // and the page renderer. Old `short` aliases still accepted for back-compat.
  how_to_wear: z.string().optional(),
  short: z.string().optional(),
  layering_notes: z.string().optional(),
}).transform((v) => ({
  occasions: v.occasions,
  how_to_wear: v.how_to_wear ?? v.short,
  layering_notes: v.layering_notes,
}));

export const DupeRec = z.object({
  house: z.string().min(1),
  name: z.string().min(1),
  similarity: z.enum(["very close", "close", "inspired by"]).optional(),
  note: z.string().optional(),
  price_tier: z.enum(["budget", "mid", "designer", "niche"]).optional(),
});
// Editorial-authored dupes always get source="editorial" stamped at ingest time.

export const FragranceFrontmatter = z.object({
  name: z.string().min(1),
  house: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+(--[a-z0-9-]+)+$/, "slug must be house--fragrance kebab"),
  year: z.number().int().optional(),
  perfumer: z.string().optional(),
  how_to_wear: WearGuidance.optional(),
  dupes: z.array(DupeRec).optional(),
});

export type NoteContent = {
  frontmatter: z.infer<typeof NoteFrontmatter>;
  body: string;
  filepath: string;
};
export type HouseContent = {
  frontmatter: z.infer<typeof HouseFrontmatter>;
  body: string;
  filepath: string;
};
export type FragranceContent = {
  frontmatter: z.infer<typeof FragranceFrontmatter>;
  body: string;
  filepath: string;
};
