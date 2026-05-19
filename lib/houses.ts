// Editorial house loader. Mirror of lib/notes.ts but for /editorial/houses/*.md.
//
// House frontmatter:
//   ---
//   name: Tom Ford
//   slug: tom-ford
//   founded: 2006
//   founder: Tom Ford
//   country: United States
//   website: https://...
//   ---
//   <body>

import fs from "node:fs/promises";
import path from "node:path";
import { houseSlug } from "./slugs";

// Re-export for back-compat with server-side callers. Client components
// should import from "@/lib/slugs" instead, since this module pulls in
// fs/path Node built-ins that Webpack can't bundle for the browser.
export { houseSlug };

const HOUSES_DIR = path.join(process.cwd(), "editorial", "houses");

export interface HouseEditorial {
  /** Display name, e.g. "Tom Ford". Preserved with capitalization. */
  name: string;
  /** URL slug, e.g. "tom-ford". */
  slug: string;
  /** Founding year, if known. */
  founded?: number;
  /** Founder(s). */
  founder?: string;
  /** Country of origin. */
  country?: string;
  /** Official website URL. */
  website?: string;
  /** Body — house history, style description. */
  body: string;
}

export async function loadHouse(slug: string): Promise<HouseEditorial | null> {
  const normalized = houseSlug(slug);
  try {
    const raw = await fs.readFile(
      path.join(HOUSES_DIR, `${normalized}.md`),
      "utf8",
    );
    return parseHouse(raw, normalized);
  } catch {
    // Fall through — try scanning all files in case the URL slug doesn't
    // match the filename (rare, but defensive).
    const all = await loadAllHouses();
    return all.find((h) => h.slug === normalized) ?? null;
  }
}

export async function loadAllHouses(): Promise<HouseEditorial[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(HOUSES_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md"));
  const loaded = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(HOUSES_DIR, file), "utf8");
      const slug = file.replace(/\.md$/, "");
      return parseHouse(raw, slug);
    }),
  );
  return loaded.sort((a, b) => a.name.localeCompare(b.name));
}

function parseHouse(raw: string, fileSlug: string): HouseEditorial {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) {
    return {
      slug: fileSlug,
      name: fileSlug.replace(/-/g, " "),
      body: raw.trim(),
    };
  }
  const [, fm, body] = m;
  const data: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim();
  }
  return {
    slug: data.slug ?? fileSlug,
    name: data.name ?? fileSlug.replace(/-/g, " "),
    founded: data.founded ? Number(data.founded) : undefined,
    founder: data.founder || undefined,
    country: data.country || undefined,
    website: data.website || undefined,
    body: body.trim(),
  };
}
