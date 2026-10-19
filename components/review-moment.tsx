"use client";

// Mounted on the fragrance page. In the native shell it counts the page
// as a lookup and then, if a review milestone has been reached and every
// guard in lib/review-prompt passes, asks for the system rating sheet
// once the page has settled. Nothing on the web.

import { useEffect } from "react";
import { maybeRequestReview, recordLookup } from "@/lib/review-prompt";

export function ReviewMoment() {
  useEffect(() => {
    recordLookup();
    void maybeRequestReview();
  }, []);
  return null;
}
