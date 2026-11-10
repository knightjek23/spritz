"use client";

// "How did you hear about Spritz?" (D39 slice 3).
//
// Asked once per person: on /welcome after the three picks are saved, or,
// for people who skipped /welcome, in a sheet after their first shelf add.
// The answer is recorded two ways:
//   - as a response to the PostHog survey below (type `api`: PostHog holds
//     the definition, the app draws it and sends the survey events)
//   - as the person property `acquisition_source` (set once), so retention
//     and purchases can be split by where people came from
//
// "Asked" is remembered on the device and on the Clerk user
// (unsafeMetadata.acquisition_asked), so a second phone doesn't ask again.

import type { useUser } from "@clerk/nextjs";

/** PostHog survey "How did you hear about Spritz?" (project 692227). */
export const ACQUISITION_SURVEY_ID = "01a1c426-3f8b-0000-a36d-825f43cc2f1b";
const QUESTION_ID = "c34d90b6-c7bd-4d42-87ff-61d5a8c4ee44";
export const ACQUISITION_QUESTION = "How did you hear about Spritz?";

// Labels must match the survey's choices in PostHog exactly. `key` is what
// lands in the person property.
export const ACQUISITION_CHOICES = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "store_search", label: "App Store or Google Play search" },
  { key: "friend", label: "A friend" },
  { key: "other", label: "Something else" },
] as const;

export type AcquisitionKey = (typeof ACQUISITION_CHOICES)[number]["key"];

type ClerkUser = ReturnType<typeof useUser>["user"];

type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => void };
function ph(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  const p = (window as unknown as { posthog?: PostHogLike }).posthog;
  return p && typeof p.capture === "function" ? p : null;
}

const ASKED_KEY = "spritz:acquisition:asked";

export function acquisitionAsked(user: ClerkUser): boolean {
  if (user?.unsafeMetadata?.acquisition_asked === true) return true;
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Answered or skipped: never ask this person again. */
export function markAcquisitionAsked(user: ClerkUser): void {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* the Clerk flag below still covers it */
  }
  // Best effort: a failed write only risks one repeat question on another device.
  user?.update({ unsafeMetadata: { ...user.unsafeMetadata, acquisition_asked: true } }).catch(() => {});
}

const base = { $survey_id: ACQUISITION_SURVEY_ID, $survey_iteration: null };

export function trackAcquisitionShown(where: "welcome" | "shelf_add"): void {
  ph()?.capture("survey shown", { ...base, where });
}

export function trackAcquisitionSkipped(where: "welcome" | "shelf_add"): void {
  ph()?.capture("survey dismissed", { ...base, where });
}

/** `detail` is the typed text for "Something else". */
export function trackAcquisitionAnswer(
  key: AcquisitionKey,
  detail: string | null,
  where: "welcome" | "shelf_add",
): void {
  const label = ACQUISITION_CHOICES.find((c) => c.key === key)?.label ?? key;
  const text = key === "other" && detail ? detail : label;
  const submissionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  ph()?.capture("survey sent", {
    ...base,
    $survey_submission_id: submissionId,
    $survey_completed: true,
    $survey_questions: [{ id: QUESTION_ID, question: ACQUISITION_QUESTION }],
    [`$survey_response_${QUESTION_ID}`]: text,
    where,
    $set_once: {
      acquisition_source: key,
      ...(key === "other" && detail ? { acquisition_source_detail: detail } : {}),
    },
  });
}

// ---------- Fallback trigger ----------
// Save buttons announce a successful shelf add; <AcquisitionPrompt> listens.

const SHELF_ADD_EVENT = "spritz:shelf-added";

export function announceShelfAdd(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHELF_ADD_EVENT));
}

export function onShelfAdd(handler: () => void): () => void {
  window.addEventListener(SHELF_ADD_EVENT, handler);
  return () => window.removeEventListener(SHELF_ADD_EVENT, handler);
}
