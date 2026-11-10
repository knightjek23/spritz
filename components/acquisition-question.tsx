"use client";

// The "How did you hear about Spritz?" question itself (D39 slice 3): five
// one-tap answers, a short text field behind "Something else", and Skip.
// Used full-page on /welcome and inside <AcquisitionPrompt>'s sheet. Either
// way the person is asked once: answering or skipping both mark it done.

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ACQUISITION_CHOICES,
  ACQUISITION_QUESTION,
  markAcquisitionAsked,
  trackAcquisitionAnswer,
  trackAcquisitionShown,
  trackAcquisitionSkipped,
  type AcquisitionKey,
} from "@/lib/acquisition";

export function AcquisitionQuestion({
  where,
  onDone,
}: {
  where: "welcome" | "shelf_add";
  onDone: () => void;
}) {
  const { user } = useUser();
  const [other, setOther] = useState(false);
  const [detail, setDetail] = useState("");
  const finished = useRef(false);

  useEffect(() => {
    trackAcquisitionShown(where);
  }, [where]);

  function answer(key: AcquisitionKey, text: string | null) {
    if (finished.current) return;
    finished.current = true;
    trackAcquisitionAnswer(key, text, where);
    markAcquisitionAsked(user);
    onDone();
  }

  function skip() {
    if (finished.current) return;
    finished.current = true;
    trackAcquisitionSkipped(where);
    markAcquisitionAsked(user);
    onDone();
  }

  return (
    <div>
      <h2 className="font-display text-2xl leading-tight mb-2">{ACQUISITION_QUESTION}</h2>
      <p className="text-sm text-slate leading-normal mb-4">One tap. It tells us where to find more people like you.</p>

      <div className="flex flex-col gap-2">
        {ACQUISITION_CHOICES.map((c) =>
          c.key === "other" && other ? (
            <form
              key={c.key}
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                answer("other", detail.trim() || null);
              }}
            >
              <label htmlFor="acquisition-detail" className="sr-only">
                Where did you hear about Spritz?
              </label>
              <input
                id="acquisition-detail"
                type="text"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={80}
                autoFocus
                placeholder="A podcast, a store, a group chat…"
                className="flex-1 min-w-0 min-h-12 px-4 bg-cream border border-ink/25 text-[15px] text-ink placeholder:text-slate focus:outline-none focus:border-emerald"
              />
              <button
                type="submit"
                className="shrink-0 min-h-12 px-4 bg-emerald text-cream text-[15px] font-medium hover:bg-emerald/90 transition"
              >
                Send
              </button>
            </form>
          ) : (
            <button
              key={c.key}
              type="button"
              onClick={() => (c.key === "other" ? setOther(true) : answer(c.key, null))}
              className="min-h-12 px-4 py-3 text-left border border-ink/25 text-[15px] text-ink hover:bg-ink/5 transition"
            >
              {c.label}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={skip}
        className="block w-full text-center mt-2 py-3 text-sm text-slate hover:text-ink underline underline-offset-4"
      >
        Skip
      </button>
    </div>
  );
}
