// Pure comparison logic for the notes verification pipeline
// (verify-notes.ts). No I/O and no imports, so it can be tested on its own:
//   node src/notes-compare.test.mjs
//
// The rule (spec: "Spritz data provenance spec", section 4):
//   match        same set of notes as the stored row
//   replaced     different set, or same set in different tiers; the
//                source's notes replace the row
//   not_found    the source listed no notes
//   needs_review a replacement that cannot be applied safely; nothing is
//                written and a person decides
//
// A source that gives one flat list (no top / heart / base split) can
// confirm the SET of notes but says nothing about tiers. On a match the
// stored tiers stay and tiersVerified is false. On a mismatch there is no
// way to place the new notes into tiers, so it goes to needs_review.

export interface StoredNote {
  name: string;
  weight?: number;
}

export interface StoredTiers {
  top: StoredNote[];
  mid: StoredNote[];
  base: StoredNote[];
}

/** Notes as read off a brand or retailer page. Tiered sources fill
 *  top/mid/base; flat-list sources fill only `flat`. */
export interface SourceNotes {
  top: string[];
  mid: string[];
  base: string[];
  flat: string[];
}

export type Outcome = "match" | "replaced" | "not_found" | "needs_review";

export interface CompareResult {
  outcome: Outcome;
  /** True only when the source itself gave a top / heart / base split. */
  tiersVerified: boolean;
  reason: string;
  /** Normalized names in the source but not the stored row. */
  added: string[];
  /** Normalized names in the stored row but not the source. */
  removed: string[];
}

// Different spellings of the same note. Left side is matched AFTER the
// generic cleanup below. Keep this list short and literal: a wrong alias
// silently turns a real mismatch into a match.
const ALIASES: Record<string, string> = {
  "tonka": "tonka bean",
  "tonka beans": "tonka bean",
  "cedarwood": "cedar",
  "cedar wood": "cedar",
  "vanille": "vanilla",
  "vanilla bean": "vanilla",
  "orange flower": "orange blossom",
  "ambrox": "ambroxan",
  "white musks": "white musk",
  "musks": "musk",
  "woods": "woody notes",
  "woody note": "woody notes",
  "pink peppercorn": "pink pepper",
  "black peppercorn": "black pepper",
  "olibanum": "frankincense",
  "incense": "frankincense",
  "lily of the valley": "lily-of-the-valley",
  "muguet": "lily-of-the-valley",
  "cocoa": "cacao",
  "lychee": "litchi",
  "guaiacwood": "guaiac wood",
  "gaiac wood": "guaiac wood",
  "mandarin": "mandarin orange",
  "blackcurrant": "black currant",
  "cassis": "black currant",
  "oak moss": "oakmoss",
  "may rose": "rose",
  "rose de mai": "rose",
  "centifolia rose": "rose",
  "damask rose": "rose",
  "jasmine flowers": "jasmine",
  "jasmine flower": "jasmine",
  "jasmine sambac": "jasmine",
  "sambac jasmine": "jasmine",
  "grandiflorum jasmine": "jasmine",
  "grandiflorum jasmine flowers": "jasmine",
  "spice": "spicy notes",
  "spices": "spicy notes",
  "marine notes": "sea notes",
  "marine": "sea notes",
  "tonka beans absolute": "tonka bean",
  "hiacynth": "hyacinth",
  "pitosporum": "pittosporum",
  "bellflower": "campanula",
  "african orange flower": "orange blossom",
  "ambrette musk mallow": "ambrette",
  "bay leaf": "bay",
  "vervain": "verbena",
  "sea": "sea notes",
};

const ORIGIN_WORDS =
  /^(papua new guinean|new caledonian|italian|calabrian|sicilian|moroccan|french|indian|haitian|virginian|virginia|atlas|bulgarian|turkish|egyptian|madagascar|madagascan|tahitian|bourbon|indonesian|australian|mysore|grasse|somalian|somali|peruvian|brazilian|chinese|tunisian|florentine|tuscan)\s+/;

const FORM_WORDS = /\s+(oil|essence|absolute|extract|accord|note|notes|essential oil)$/;

export function normalizeNote(raw: string): string {
  let s = raw
    .replace(/[\u2122\u00ae]/g, "") // TM, (R): before NFKD, which expands TM to "TM"
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "woody notes" is itself a note name; only strip a trailing form word
  // when something meaningful is left and the result is not an alias key.
  const stripped = s.replace(FORM_WORDS, "").trim();
  if (stripped && stripped !== s && !/^(woody|green|fruity|floral|spicy|marine|aquatic|citrus|powdery|leather|amber)$/.test(stripped)) {
    s = stripped;
  }
  s = s.replace(/ from [a-z -]+$/, "").trim(); // "jasmine from grasse"
  s = s.replace(/ petals?$/, "").trim();
  s = s.replace(ORIGIN_WORDS, "").trim();
  return ALIASES[s] ?? s;
}

function normSet(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    const k = normalizeNote(n);
    if (k) out.add(k);
  }
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function compareNotes(stored: StoredTiers, source: SourceNotes): CompareResult {
  const sourceTiered = source.top.length + source.mid.length + source.base.length > 0;
  const sourceAllNames = sourceTiered
    ? [...source.top, ...source.mid, ...source.base]
    : source.flat;

  const storedAll = normSet([...stored.top, ...stored.mid, ...stored.base].map((n) => n.name));
  const sourceAll = normSet(sourceAllNames);

  const added = [...sourceAll].filter((n) => !storedAll.has(n)).sort();
  const removed = [...storedAll].filter((n) => !sourceAll.has(n)).sort();
  const base = { added, removed };

  if (sourceAll.size === 0) {
    return { outcome: "not_found", tiersVerified: false, reason: "source listed no notes", ...base };
  }

  if (sameSet(storedAll, sourceAll)) {
    if (!sourceTiered) {
      return {
        outcome: "match",
        tiersVerified: false,
        reason: "same notes; source gives a flat list, stored tiers kept",
        ...base,
      };
    }
    const tiersEqual =
      sameSet(normSet(stored.top.map((n) => n.name)), normSet(source.top)) &&
      sameSet(normSet(stored.mid.map((n) => n.name)), normSet(source.mid)) &&
      sameSet(normSet(stored.base.map((n) => n.name)), normSet(source.base));
    if (tiersEqual) {
      return { outcome: "match", tiersVerified: true, reason: "same notes, same tiers", ...base };
    }
    return {
      outcome: "replaced",
      tiersVerified: true,
      reason: "same notes, different tiers; source tiers adopted",
      ...base,
    };
  }

  // Sets differ.
  if (!sourceTiered) {
    return {
      outcome: "needs_review",
      tiersVerified: false,
      reason: "notes differ and source gives a flat list, so new notes cannot be placed in tiers",
      ...base,
    };
  }
  if (sourceAll.size < 3) {
    return {
      outcome: "needs_review",
      tiersVerified: false,
      reason: `source lists only ${sourceAll.size} note(s)`,
      ...base,
    };
  }
  if (storedAll.size > 0 && sourceAll.size * 2 < storedAll.size) {
    return {
      outcome: "needs_review",
      tiersVerified: false,
      reason: `replacement would cut notes from ${storedAll.size} to ${sourceAll.size}`,
      ...base,
    };
  }
  return {
    outcome: "replaced",
    tiersVerified: true,
    reason: "notes differ; source notes adopted",
    ...base,
  };
}

/** The row to store when the outcome is "replaced". Source order is kept,
 *  names are the source's own wording, weight is a flat 1 (Spritz's own
 *  value, not a vote weight). Duplicates within a tier are dropped. */
export function buildReplacement(source: SourceNotes): StoredTiers {
  const tier = (names: string[]): StoredNote[] => {
    const seen = new Set<string>();
    const out: StoredNote[] = [];
    for (const raw of names) {
      const name = raw.replace(/\s+/g, " ").trim();
      const key = normalizeNote(name);
      if (!name || !key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, weight: 1 });
    }
    return out;
  };
  return { top: tier(source.top), mid: tier(source.mid), base: tier(source.base) };
}

// Sites that must never count as a source for verification. These are
// fragrance databases and community sites, not the brand or a retailer.
const BLOCKED_SOURCE_HOSTS = [
  "fragrantica.",
  "parfumo.",
  "basenotes.",
  "wikiparfum.",
  "fragella.",
  "fragdb.",
  "wikipedia.org",
  "reddit.com",
  "fandom.com",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isBlockedSource(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  return BLOCKED_SOURCE_HOSTS.some((b) => host.includes(b));
}

// Marketing phrases that are not notes: "bright citrus top notes",
// "dry woody tones", "woody ambery musky accord". A real note is short.
const DESCRIPTOR_WORDS =
  /(^| )(tones?|facets?|trail|signature|sensation|top|heart|base|opening|drydown|bright|intense|powerful|radiant|luminous|sensual|addictive|elegant|vibrant|ambery|musky)( |$)/;

export function isDescriptor(raw: string): boolean {
  const s = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/ +/g, " ")
    .trim();
  if (!s) return true;
  // Length is judged after origin and form words are stripped, so
  // "Papua New Guinean vanilla extract" counts as one word, not five.
  if (normalizeNote(raw).split(" ").length > 3) return true;
  return DESCRIPTOR_WORDS.test(s);
}

/** Share of notes the two rows have in common: shared / all distinct notes,
 *  0 to 1, ignoring tiers. 1 means the same set of notes. */
export function noteOverlap(stored: StoredTiers, source: SourceNotes): number {
  const a = normSet([...stored.top, ...stored.mid, ...stored.base].map((n) => n.name));
  const b = normSet([...source.top, ...source.mid, ...source.base, ...source.flat]);
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const v of a) if (b.has(v)) shared++;
  return shared / (a.size + b.size - shared);
}
