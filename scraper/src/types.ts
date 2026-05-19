// Internal scraper types — mirror lib/types.ts but kept separate so the scraper
// stays decoupled from the Next.js app.

export interface ScrapedNote {
  name: string;
  weight: number; // 0–1
}

export interface WearGuidance {
  occasions?: string[];
  how_to_wear?: string;
  layering_notes?: string;
}

export interface ScrapedFragrance {
  name: string;
  house: string;
  family: string[];
  gender: "masculine" | "feminine" | "unisex" | null;
  year: number | null;
  top_notes: ScrapedNote[];
  mid_notes: ScrapedNote[];
  base_notes: ScrapedNote[];
  longevity_score: number | null;
  longevity_confidence: number | null;
  sillage_score: number | null;
  sillage_confidence: number | null;
  season_tags: string[];
  time_tags: string[];
  similar_urls: string[];           // resolved to UUIDs at upload time
  // Encyclopedia content — driven by the new positioning. PRD §15 Q2.
  perfumer: string | null;
  house_history: string | null;
  wear_guidance: WearGuidance;
  notes_descriptions: Record<string, string>;
  bottle_image_url: string | null;
  editorial_notes: string | null;
  // Internal
  fragrantica_url: string;
  popularity_rank: number | null;
}
