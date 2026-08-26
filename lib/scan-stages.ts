// Scan v2 streaming protocol + the words for each stage.
//
// POST /api/scan with `Accept: application/x-ndjson` streams one JSON
// frame per line while the scan runs. The client renders a Dynamic
// Checklist from these frames (ai-transparency-patterns: multi-step work
// with unpredictable timing gets a checklist, not a spinner). Every line of
// copy follows the Agentic Update Formula: Action word + specific item +
// the limit being respected, filled with the REAL brand/name/house the
// server just read, so the user can tell the system understood the photo.
//
// The last frame is always `result` or `error`. Clients that don't send the
// Accept header get the plain JSON ScanResult (Capacitor shell, old builds).
//
// Shared by the route (producer) and the scan page (consumer). No React,
// no Node-only imports — it's bundled into both.

import type { ScanResult } from "./types";

export type ScanFrame =
  | { type: "stage"; stage: "reading" }
  | {
      type: "stage";
      stage: "read";
      ok: boolean;
      brand: string | null;
      name: string | null;
    }
  | {
      type: "stage";
      stage: "matching";
      name: string;
      /** Catalog row count for the copy; null when the cached count isn't in yet. */
      catalog_size: number | null;
    }
  | {
      type: "candidates";
      /** Slim list so the client can prefetch detail pages before the verdict. */
      items: Array<{ id: string; name: string; house: string }>;
    }
  | { type: "stage"; stage: "comparing"; house: string | null }
  | { type: "stage"; stage: "deciding" }
  | { type: "stage"; stage: "web" }
  | { type: "result"; result: ScanResult }
  | { type: "error"; code: ScanErrorCode };

export type ScanErrorCode =
  | "ocr_timeout"
  | "ocr_failed"
  | "catalog_unreachable"
  | "scan_failed"
  | "rate_limited"
  | "invalid_body";

// A checklist row. `strong` is the part the eye should land on (the action
// or the thing we read); `rest` is the qualifier. Kept as two strings so
// the component decides the markup, not this module.
export interface StageLine {
  key: string;
  strong: string;
  rest: string;
}

function quote(brand: string | null, name: string | null): string {
  const parts = [brand, name].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return `“${parts.join(" · ")}”`;
}

function formatCount(n: number | null): string {
  if (!n) return "every fragrance";
  return `${n.toLocaleString("en-US")} fragrances`;
}

/**
 * Translate a stream frame into the checklist line it should show, or null
 * for frames that don't add a row (candidates, result, error).
 */
export function stageLine(frame: ScanFrame): StageLine | null {
  switch (frame.type) {
    case "stage":
      switch (frame.stage) {
        case "reading":
          return {
            key: "reading",
            strong: "Reading the label",
            rest: "for the house and fragrance name",
          };
        case "read":
          return frame.ok
            ? {
                key: "read",
                strong: `Read ${quote(frame.brand, frame.name)}`,
                rest: "",
              }
            : {
                key: "read",
                strong: "Couldn’t read the label clearly.",
                rest: "Going by the bottle’s shape and color instead",
              };
        case "matching":
          return {
            key: "matching",
            strong: `Matching “${frame.name}”`,
            rest: `against ${formatCount(frame.catalog_size)} in the Library`,
          };
        case "comparing":
          return {
            key: "comparing",
            strong: "Comparing the bottle’s shape and color",
            rest: frame.house
              ? `with ${frame.house}’s bottles`
              : "across the whole Library",
          };
        case "deciding":
          return {
            key: "deciding",
            strong: "Two close matches.",
            rest: "Checking the cap and label layout to separate them",
          };
        case "web":
          return {
            key: "web",
            strong: "Not in the Library yet.",
            rest: "Checking the wider web for this bottle",
          };
      }
      return null;
    default:
      return null;
  }
}

/** The closing line once a result lands. */
export function resultLine(result: ScanResult): StageLine {
  if (result.matched) {
    return {
      key: "done",
      strong: "Found it.",
      rest: `Opening ${result.matched.name}`,
    };
  }
  if (result.candidates.length > 0) {
    return {
      key: "done",
      strong: "Close, but not certain.",
      rest: "Pick the one in your hand",
    };
  }
  return {
    key: "done",
    strong: "Couldn’t place this one yet.",
    rest: "Search by name or tell us what it is",
  };
}

/**
 * Error copy that names the real cause (ai-transparency-patterns:
 * "disentangling the tool") so a vendor hiccup doesn't read as the app
 * being broken. Never leaks a raw slug.
 */
export function errorCopy(code: string): string {
  switch (code) {
    case "ocr_timeout":
      return "The label reader didn’t answer in time. Your photo is fine. Try once more.";
    case "ocr_failed":
      return "The label reader is having trouble right now. Try again in a moment, or search by name.";
    case "catalog_unreachable":
      return "We couldn’t reach the Library just now. Try again in a moment.";
    case "rate_limited":
      return "You’ve hit today’s scan limit. It resets at midnight UTC, or search by name below.";
    case "invalid_body":
      return "That photo didn’t come through right. Try taking it again.";
    case "scan_failed":
    default:
      return "Something went wrong reading the bottle. Give it another try.";
  }
}

/** Human label for the audit-trail receipt on the detail page. */
export function matchMethodLabel(method: ScanResult["match_method"]): string {
  switch (method) {
    case "text":
      return "label text";
    case "text+visual":
      return "label text + bottle shape";
    case "visual":
      return "bottle shape and color";
    case "tiebreak":
      return "label text + a close look at the bottle";
    case "web":
      return "a web image lookup";
    default:
      return "your scan";
  }
}
