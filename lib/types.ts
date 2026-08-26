// Shared TypeScript types for the app.
// Mirrors the SQL schema in supabase/migrations/0001_initial_schema.sql.

export type Gender = "masculine" | "feminine" | "unisex";
export type PriceTier = "budget" | "mid" | "designer" | "niche";
export type CollectionStatus = "own" | "tried" | "wishlist";
export type Plan = "free" | "pro";
export type Reaction = "like" | "dislike";
export type Concentration = "edt" | "edp" | "parfum" | "extrait";
export type Retailer = "scentbird" | "fragrancenet" | "nordstrom";
export type VisionProvider = "gpt4o" | "google";

export interface Note {
  name: string;
  weight: number; // 0–1, normalized vote weight
}

export interface WearGuidance {
  occasions?: string[];
  how_to_wear?: string;
  layering_notes?: string;
}

export interface DupeRecommendation {
  house: string;
  name: string;
  similarity?: "very close" | "close" | "inspired by";
  note?: string;
  price_tier?: PriceTier;
  // Provenance: hand-written editorial vs AI-generated. Lets the UI render
  // a clear badge so users know which is which.
  source?: "editorial" | "ai";
  // AI-generated dupes carry a 0–1 confidence the model assigned to itself.
  confidence?: number;
  // ISO timestamp of generation (mostly for AI-generated; editorial dupes don't need it).
  generated_at?: string;
}

/**
 * Community-consensus take on a fragrance, synthesized by AI from the
 * public conversation (Reddit, Fragrantica, Basenotes, FragranceTok,
 * forum reviews). Pro-gated. Cached per fragrance — generated on first
 * Pro request and returned from cache on subsequent requests.
 */
export interface ConsensusRecord {
  /** 2-3 paragraphs of what users actually say. */
  summary: string;
  /** Short "worth the buy?" verdict line. */
  verdict: string;
  /** Bullet points: what users praise. */
  pros: string[];
  /** Bullet points: what users criticize. */
  cons: string[];
  /** Model self-rated 0-1 (low for new/niche fragrances with little
   *  community signal). UI shows a caveat banner when this is < 0.5. */
  confidence: number;
  /** ISO timestamp; used by the UI's audit-trail receipt. */
  generated_at: string;
}

export interface Fragrance {
  id: string;
  name: string;
  house: string;
  family: string[];
  gender: Gender | null;
  year: number | null;
  top_notes: Note[];
  mid_notes: Note[];
  base_notes: Note[];
  longevity_score: number | null;
  longevity_confidence: number | null;
  sillage_score: number | null;
  sillage_confidence: number | null;
  // Plain-English companions to the numeric scores. Optional editorial
  // content for beginners who can't translate "longevity 8.5h sillage
  // 0.7" into wear behavior. UI labels the sillage_* pair as
  // "Projection" per Session 01 feedback — sillage is industry jargon.
  longevity_description: string | null;
  projection_description: string | null;
  season_tags: string[];
  time_tags: string[];
  similar_ids: string[];
  // Library content (the new core per PRD §1)
  perfumer: string | null;
  house_history: string | null;
  wear_guidance: WearGuidance;
  notes_descriptions: Record<string, string>;
  bottle_image_url: string | null;
  editorial_notes: string | null;
  dupes: DupeRecommendation[];
  // Concentration / strength (EDT / EDP / Parfum / Extrait). Parsed
  // from the fragrance name when explicit ("Bleu de Chanel Eau de
  // Parfum"); NULL when the name gives no clue. See lib/concentrations.ts.
  concentration: Concentration | null;
  // Community consensus (Pro feature) — null until first Pro user
  // requests generation, then cached forever. UI surfaces this in the
  // KnownConsensus component on the detail page.
  consensus_summary: string | null;
  consensus_verdict: string | null;
  consensus_pros: string[] | null;
  consensus_cons: string[] | null;
  consensus_confidence: number | null;
  consensus_generated_at: string | null;
  // Internal use only — never rendered directly
  avg_retail_price: number | null;
  price_tier: PriceTier | null;
  popularity_rank: number | null;
}

export interface User {
  id: string;
  clerk_user_id: string;
  email: string | null;
  plan: Plan;
  stripe_customer_id: string | null;
  // True for one-time lifetime Pro buyers. Entitlement still rides on
  // `plan === "pro"`; this flag just protects that from subscription events.
  is_lifetime: boolean;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  fragrance_id: string;
  status: CollectionStatus;
  note: string | null;
  added_at: string;
}

/** Per-user Like / Dislike on a fragrance. Independent from collection —
 *  a user can react to a fragrance they don't own. */
export interface UserReaction {
  user_id: string;
  fragrance_id: string;
  reaction: Reaction;
  created_at: string;
  updated_at: string;
}

export interface ScanEvent {
  id: string;
  user_id: string | null;
  ip_hash: string;
  image_url: string | null;
  detected_brand: string | null;
  detected_name: string | null;
  matched_fragrance_id: string | null;
  confidence: number | null;
  vision_provider: VisionProvider;
  latency_ms: number;
  created_at: string;
}

export interface DupePair {
  fragrance_a: string;
  fragrance_b: string;
  score: number;
  shared_notes: Array<{ name: string; weight_a: number; weight_b: number }>;
}

// API response shapes

/**
 * How a scan match was reached. Scan v2 (see SCAN_V2_DESIGN.md §4.4):
 *   "text"        — OCR text alone was confident and the visual layer agreed
 *                   (or wasn't available).
 *   "text+visual" — text was ambiguous; fused text + bottle-embedding score
 *                   picked the winner.
 *   "visual"      — label unreadable; bottle shape/color embedding alone.
 *   "tiebreak"    — fused top-2 were too close; GPT-4o compared the photo
 *                   against those candidates' catalog images.
 *   "web"         — nothing in-catalog was confident; a web visual lookup
 *                   (Google Lens) named it and the name matched the catalog.
 *   "none"        — no match.
 */
export type ScanMatchMethod =
  | "text"
  | "text+visual"
  | "visual"
  | "tiebreak"
  | "web"
  | "none";

export interface ScanCandidate {
  fragrance: Fragrance;
  /** Final ranking score, 0–1. Fused when both signals exist. */
  confidence: number;
  /** Trigram score from search_fragrances, when the candidate came from text. */
  text_score?: number;
  /** Raw cosine similarity from the bottle-embedding index, when present. */
  visual_score?: number;
}

export interface ScanResult {
  matched: Fragrance | null;
  candidates: ScanCandidate[];
  confidence: number;
  detected_brand: string | null;
  detected_name: string | null;
  scan_event_id: string;
  /** Optional for back-compat with older clients; the route always sets it. */
  match_method?: ScanMatchMethod;
  /** When match_method === "tiebreak", a short human-readable reason. */
  visual_reason?: string;
  /**
   * Set when the scan succeeded on a weaker path than usual, so the UI can
   * say so instead of presenting a confident-looking answer:
   *   "label_unreadable" — OCR returned nothing; the match is visual-only.
   */
  partial?: "label_unreadable";
}

export interface DupeResult {
  fragrance: Fragrance;
  similarity: number;       // 0–1
  similarity_pct: number;   // 0–100, rounded
  price_delta: number | null;
  shared_notes: string[];   // top 3 by combined weight
}
