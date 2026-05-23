// Route catalog for the screenshot script.
//
// Static routes: hard-coded paths.
// Dynamic routes ([id] / [slug]): we hit Supabase to grab one
// representative row, then build the path. Keeps the script honest with
// the real catalog instead of hard-coding sample IDs that might rotate.

import { createClient } from "@supabase/supabase-js";
import { readdir } from "node:fs/promises";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Source .env.local before running the screenshot script.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

/**
 * Resolve dynamic routes by pulling one row of each kind from the DB.
 * Returns the same shape regardless of how many rows exist (null for empty).
 */
export async function resolveDynamicRoutes() {
  // Fragrance: pick the most popular row with a bottle image so the
  // detail page renders its hero properly.
  const { data: frag } = await supabase
    .from("fragrances")
    .select("id, name, house")
    .not("bottle_image_url", "is", null)
    .order("popularity_rank", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // House + family come from RPCs added in migrations 0007 / 0008.
  const [{ data: houseSlugs }, { data: famSlugs }] = await Promise.all([
    supabase.rpc("list_catalog_houses", { p_limit: 1 }),
    supabase.rpc("list_catalog_families", { p_limit: 1 }),
  ]);

  // Notes are file-based (editorial/notes/*.md). Just grab the first
  // markdown filename and strip the extension. Defaults to "tobacco"
  // if anything goes wrong, since that one's known to exist.
  let noteSlug = "tobacco";
  try {
    const files = await readdir("editorial/notes");
    const md = files.find((f) => f.endsWith(".md"));
    if (md) noteSlug = md.replace(/\.md$/, "");
  } catch {
    /* fall through to default */
  }

  return {
    fragranceId: frag?.id ?? null,
    fragranceLabel: frag ? `${frag.house} - ${frag.name}` : null,
    noteSlug,
    houseSlug: Array.isArray(houseSlugs) && houseSlugs[0]?.house
      ? slugify(houseSlugs[0].house)
      : null,
    familySlug: Array.isArray(famSlugs) && famSlugs[0]?.family
      ? famSlugs[0].family
      : null,
  };
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the full route list given resolved dynamic identifiers.
 * Each entry: { name, path, auth, viewport?, beforeShot?, waitFor? }
 *   - name        slug-safe filename
 *   - path        URL path
 *   - auth        "out" | "in" | "both"  (which auth state to capture)
 *   - beforeShot  optional async (page) => void hook to drive interactions
 *                 like opening typeahead or switching tabs before snap
 *   - waitFor     optional CSS selector to wait for before screenshot
 */
export function buildRouteList(dyn) {
  const routes = [
    // ===== Marketing + signed-out =====
    { name: "01-home-marketing", path: "/", auth: "out" },
    { name: "02-pricing", path: "/pricing", auth: "out" },
    { name: "03-sign-in", path: "/sign-in", auth: "out" },
    { name: "04-sign-up", path: "/sign-up", auth: "out" },
    { name: "05-scan-signed-out", path: "/scan", auth: "out" },

    // ===== Core encyclopedia (public, no auth needed) =====
    { name: "10-families-index", path: "/families", auth: "both" },
    { name: "11-houses-index", path: "/houses", auth: "both" },
    { name: "12-notes-index", path: "/notes", auth: "both" },
    { name: "13-search-empty", path: "/search", auth: "both" },
    {
      name: "14-search-typeahead-open",
      path: "/search",
      auth: "both",
      beforeShot: async (page) => {
        const input = page.locator('input[type="search"], input[type="text"]').first();
        await input.click();
        await input.fill("tobacco");
        // Give the typeahead time to fetch + render.
        await page.waitForTimeout(800);
      },
    },
    { name: "15-search-results", path: "/search?q=tobacco", auth: "both" },
  ];

  if (dyn.fragranceId) {
    routes.push({
      name: "20-fragrance-detail",
      path: `/fragrance/${dyn.fragranceId}`,
      auth: "both",
      waitFor: "h1",
    });
  }
  if (dyn.noteSlug) {
    routes.push({
      name: "21-note-detail",
      path: `/note/${dyn.noteSlug}`,
      auth: "both",
    });
  }
  if (dyn.houseSlug) {
    routes.push({
      name: "22-house-detail",
      path: `/house/${dyn.houseSlug}`,
      auth: "both",
    });
  }
  if (dyn.familySlug) {
    routes.push({
      name: "23-family-detail",
      path: `/family/${dyn.familySlug}`,
      auth: "both",
    });
  }

  // ===== Signed-in product surfaces =====
  routes.push(
    { name: "30-home-for-you", path: "/", auth: "in" },
    { name: "31-welcome-onboarding", path: "/welcome", auth: "in" },
    { name: "32-collection-own", path: "/collection?tab=own", auth: "in" },
    { name: "33-collection-tried", path: "/collection?tab=tried", auth: "in" },
    { name: "34-collection-wishlist", path: "/collection?tab=wishlist", auth: "in" },
    { name: "35-account-settings", path: "/account", auth: "in" },
    { name: "36-scan-signed-in", path: "/scan", auth: "in" },
  );

  return routes;
}
