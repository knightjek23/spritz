// Hand-rolled Database type that mirrors supabase/migrations/0001_initial_schema.sql.
// Once Josh's Supabase project is live, replace this file with:
//   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
// Until then, this keeps the SupabaseClient<Database> generic happy and gives the
// API routes real autocomplete + type safety.

import type { Note, DupeRecommendation } from "../types";

export type Database = {
  // Required by @supabase/supabase-js >= 2.50 — the SDK looks for this on the
  // Database generic. The CLI generator emits the same shape.
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      fragrances: {
        Row: {
          id: string;
          name: string;
          house: string;
          family: string[];
          gender: "masculine" | "feminine" | "unisex" | null;
          year: number | null;
          top_notes: Note[];
          mid_notes: Note[];
          base_notes: Note[];
          note_vector: number[] | null;
          longevity_score: number | null;
          longevity_confidence: number | null;
          sillage_score: number | null;
          sillage_confidence: number | null;
          longevity_description: string | null;
          projection_description: string | null;
          season_tags: string[];
          time_tags: string[];
          similar_ids: string[];
          // Encyclopedia content
          perfumer: string | null;
          house_history: string | null;
          wear_guidance: {
            occasions?: string[];
            how_to_wear?: string;
            layering_notes?: string;
          };
          notes_descriptions: Record<string, string>;
          bottle_image_url: string | null;
          editorial_notes: string | null;
          dupes: DupeRecommendation[];
          // Internal
          fragrantica_url: string | null;
          avg_retail_price: number | null;
          price_tier: "budget" | "mid" | "designer" | "niche" | null;
          popularity_rank: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          house: string;
          family?: string[];
          gender?: "masculine" | "feminine" | "unisex" | null;
          year?: number | null;
          top_notes?: Note[];
          mid_notes?: Note[];
          base_notes?: Note[];
          note_vector?: number[] | null;
          longevity_score?: number | null;
          longevity_confidence?: number | null;
          sillage_score?: number | null;
          sillage_confidence?: number | null;
          longevity_description?: string | null;
          projection_description?: string | null;
          season_tags?: string[];
          time_tags?: string[];
          similar_ids?: string[];
          perfumer?: string | null;
          house_history?: string | null;
          wear_guidance?: {
            occasions?: string[];
            how_to_wear?: string;
            layering_notes?: string;
          };
          notes_descriptions?: Record<string, string>;
          bottle_image_url?: string | null;
          editorial_notes?: string | null;
          dupes?: DupeRecommendation[];
          fragrantica_url?: string | null;
          avg_retail_price?: number | null;
          price_tier?: "budget" | "mid" | "designer" | "niche" | null;
          popularity_rank?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["fragrances"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          clerk_user_id: string;
          email: string | null;
          plan: "free" | "pro";
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          clerk_user_id: string;
          email?: string | null;
          plan?: "free" | "pro";
          stripe_customer_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      collection_items: {
        Row: {
          id: string;
          user_id: string;
          fragrance_id: string;
          status: "own" | "tried" | "wishlist";
          note: string | null;
          added_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fragrance_id: string;
          status: "own" | "tried" | "wishlist";
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["collection_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "collection_items_fragrance_id_fkey";
            columns: ["fragrance_id"];
            referencedRelation: "fragrances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_items_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      scan_events: {
        Row: {
          id: string;
          user_id: string | null;
          ip_hash: string;
          image_url: string | null;
          detected_brand: string | null;
          detected_name: string | null;
          matched_fragrance_id: string | null;
          confidence: number | null;
          vision_provider: "gpt4o" | "google";
          latency_ms: number;
          user_reported_brand: string | null;
          user_reported_name: string | null;
          user_reported_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          ip_hash: string;
          image_url?: string | null;
          detected_brand?: string | null;
          detected_name?: string | null;
          matched_fragrance_id?: string | null;
          confidence?: number | null;
          vision_provider: "gpt4o" | "google";
          latency_ms: number;
          user_reported_brand?: string | null;
          user_reported_name?: string | null;
          user_reported_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["scan_events"]["Insert"]>;
        Relationships: [];
      };
      affiliate_clicks: {
        Row: {
          id: string;
          user_id: string | null;
          fragrance_id: string;
          retailer: "scentbird" | "fragrancenet" | "nordstrom";
          clicked_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          fragrance_id: string;
          retailer: "scentbird" | "fragrancenet" | "nordstrom";
        };
        Update: Partial<Database["public"]["Tables"]["affiliate_clicks"]["Insert"]>;
        Relationships: [];
      };
      dupe_pairs: {
        Row: {
          fragrance_a: string;
          fragrance_b: string;
          score: number;
          shared_notes: Array<{ name: string; weight_a: number; weight_b: number }>;
          computed_at: string;
        };
        Insert: {
          fragrance_a: string;
          fragrance_b: string;
          score: number;
          shared_notes: Array<{ name: string; weight_a: number; weight_b: number }>;
        };
        Update: Partial<Database["public"]["Tables"]["dupe_pairs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "dupe_pairs_fragrance_a_fkey";
            columns: ["fragrance_a"];
            referencedRelation: "fragrances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dupe_pairs_fragrance_b_fkey";
            columns: ["fragrance_b"];
            referencedRelation: "fragrances";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      search_fragrances: {
        Args: { p_brand: string; p_name: string; p_limit?: number };
        Returns: Array<
          Database["public"]["Tables"]["fragrances"]["Row"] & { match_score: number }
        >;
      };
      find_similar_fragrances: {
        Args: { p_id: string; p_limit?: number };
        Returns: Array<
          Database["public"]["Tables"]["fragrances"]["Row"] & { similarity: number }
        >;
      };
      shared_notes_between: {
        Args: { p_a: string; p_b: string; p_limit?: number };
        Returns: Array<{ name: string; weight: number }>;
      };
      find_fragrances_by_note: {
        Args: { p_note: string; p_limit?: number };
        Returns: Array<
          Database["public"]["Tables"]["fragrances"]["Row"] & { layer: "top" | "mid" | "base" }
        >;
      };
      list_canonical_notes: {
        Args: { p_limit?: number };
        Returns: Array<{ name: string; fragrance_count: number }>;
      };
      find_fragrances_by_house: {
        Args: { p_slug: string; p_limit?: number };
        Returns: Array<Database["public"]["Tables"]["fragrances"]["Row"]>;
      };
      list_catalog_houses: {
        Args: { p_limit?: number };
        Returns: Array<{ house: string; slug: string; fragrance_count: number }>;
      };
      find_fragrances_by_family: {
        Args: { p_family: string; p_limit?: number };
        Returns: Array<Database["public"]["Tables"]["fragrances"]["Row"]>;
      };
      list_catalog_families: {
        Args: { p_limit?: number };
        Returns: Array<{ family: string; fragrance_count: number }>;
      };
      normalize_family: {
        Args: { p_accord: string };
        Returns: string;
      };
      list_trending_fragrances: {
        Args: { p_limit?: number; p_days?: number };
        Returns: Array<{
          id: string;
          name: string;
          house: string;
          family: string[];
          gender: "masculine" | "feminine" | "unisex" | null;
          year: number | null;
          bottle_image_url: string | null;
          scan_count: number;
        }>;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
