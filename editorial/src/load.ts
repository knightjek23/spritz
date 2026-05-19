// Walks editorial/ folders, parses frontmatter+body, validates with Zod.
// Used by both ingest.ts and validate.ts.

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  NoteFrontmatter,
  HouseFrontmatter,
  FragranceFrontmatter,
  type NoteContent,
  type HouseContent,
  type FragranceContent,
} from "./types.js";

const ROOT = path.resolve(".");
const NOTES_DIR = path.join(ROOT, "notes");
const HOUSES_DIR = path.join(ROOT, "houses");
const FRAGRANCES_DIR = path.join(ROOT, "fragrances");

async function listMd(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(dir, e.name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function parseFile(filepath: string): Promise<{ frontmatter: any; body: string }> {
  const raw = await fs.readFile(filepath, "utf8");
  const { data, content } = matter(raw);
  return { frontmatter: data, body: content.trim() };
}

export async function loadNotes(): Promise<{ items: NoteContent[]; errors: string[] }> {
  const errors: string[] = [];
  const items: NoteContent[] = [];
  for (const fp of await listMd(NOTES_DIR)) {
    try {
      const { frontmatter, body } = await parseFile(fp);
      const validated = NoteFrontmatter.parse(frontmatter);
      items.push({ frontmatter: validated, body, filepath: fp });
    } catch (err) {
      errors.push(`${fp}: ${(err as Error).message}`);
    }
  }
  return { items, errors };
}

export async function loadHouses(): Promise<{ items: HouseContent[]; errors: string[] }> {
  const errors: string[] = [];
  const items: HouseContent[] = [];
  for (const fp of await listMd(HOUSES_DIR)) {
    try {
      const { frontmatter, body } = await parseFile(fp);
      const validated = HouseFrontmatter.parse(frontmatter);
      items.push({ frontmatter: validated, body, filepath: fp });
    } catch (err) {
      errors.push(`${fp}: ${(err as Error).message}`);
    }
  }
  return { items, errors };
}

export async function loadFragrances(): Promise<{ items: FragranceContent[]; errors: string[] }> {
  const errors: string[] = [];
  const items: FragranceContent[] = [];
  for (const fp of await listMd(FRAGRANCES_DIR)) {
    try {
      const { frontmatter, body } = await parseFile(fp);
      const validated = FragranceFrontmatter.parse(frontmatter);
      items.push({ frontmatter: validated, body, filepath: fp });
    } catch (err) {
      errors.push(`${fp}: ${(err as Error).message}`);
    }
  }
  return { items, errors };
}
