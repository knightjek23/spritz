"use client";

// CameraCapture — getUserMedia viewport with corner bracket guides,
// tap-to-capture, retake/use confirmation. Falls back gracefully to a
// file input on browsers that block or don't support the camera API
// (typically older iOS / desktop privacy-mode).
//
// State machine:
//   intro      — pre-permission landing. Shows the value prop + "Use
//                camera" button. Avoids triggering the browser permission
//                prompt before the user has any context.
//   starting   — getUserMedia request in flight
//   live       — stream attached, viewport active, capture button armed
//   captured   — frame frozen on canvas, "Use this / Retake" decision
//   processing — onCapture callback running (scan in progress)
//   error      — getUserMedia failed (denial, no device, etc.)
//   fallback   — file input only. Browsers without mediaDevices API land
//                here on mount.
//
// Parent contract: pass an `onCapture(base64)` callback. The base64 is
// stripped of the `data:image/jpeg;base64,` prefix to match what the
// /api/scan endpoint expects.

import { useCallback, useEffect, useRef, useState } from "react";

type State =
  | "intro"
  | "starting"
  | "live"
  | "captured"
  | "processing"
  | "error"
  | "fallback";

interface Props {
  /** Called with raw base64 (no data: prefix) once the user confirms a capture. */
  onCapture: (base64: string) => Promise<void> | void;
  /** When true, the component shows a processing overlay instead of the capture UI. */
  busy?: boolean;
}

export function CameraCapture({ onCapture, busy = false }: Props) {
  const [state, setState] = useState<State>("intro");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Detect API support once on mount. Server-rendered first paint will
  // always show "intro" — the support check happens after hydration.
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState("fallback");
    }
  }, []);

  // Clean up the media stream on unmount or when we leave live/captured
  // state. Forgetting this leaks the camera indicator and keeps the LED
  // on between scans.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  async function startCamera() {
    setState("starting");
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          // 1280x720 is plenty for OCR; requesting higher inflates the
          // base64 payload without improving GPT-4o accuracy meaningfully.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      // Don't attempt to attach the stream to the video element here —
      // the element doesn't render until state === "live"/"captured"/etc,
      // so videoRef.current is still null at this moment. The useEffect
      // below watches `state` and attaches once the element mounts.
      setState("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "Unknown";
      setErrorMessage(
        name === "NotAllowedError"
          ? "Camera permission was denied. You can still upload a photo below."
          : name === "NotFoundError"
          ? "No camera found on this device. Upload a photo instead."
          : "Couldn't start the camera. Upload a photo instead.",
      );
      setState("error");
    }
  }

  // Attach the live stream to the video element AFTER it mounts.
  //
  // This effect fires when `state` transitions into one of the viewport
  // states (which is the first render where the <video> element exists
  // in the DOM and videoRef.current is non-null). Without this, the
  // assignment in startCamera() ran when videoRef.current was still
  // null, the if-check silently skipped, and the video element rendered
  // black — that was the original bug.
  useEffect(() => {
    if (state !== "live" && state !== "captured" && state !== "processing") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject === stream) return; // already attached
    video.srcObject = stream;
    // play() can reject on iOS if not invoked from a user gesture — but
    // startCamera() WAS invoked from a tap, so the gesture token carries
    // through. If it still rejects we swallow it; the user can tap the
    // capture button which itself counts as a gesture for re-arming.
    video.play().catch(() => {});
  }, [state]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    // The video element may have mounted but the stream hasn't produced
    // a first frame yet (videoWidth/Height are 0 until then). Drawing
    // before that produces an empty data URL that renders as the "?"
    // broken-image placeholder. Silently no-op — the user will tap
    // again naturally if nothing happens.
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    // Empty canvas serializes to a tiny "data:," — refuse to advance.
    if (!dataUrl || dataUrl.length < 1000) return;
    setCapturedDataUrl(dataUrl);
    setState("captured");
    // Pause the stream visually but keep it open — retake reuses it
    // without re-prompting for permission.
    video.pause();
  }

  function retake() {
    setCapturedDataUrl(null);
    setState("live");
    videoRef.current?.play().catch(() => {});
  }

  async function confirm() {
    if (!capturedDataUrl) return;
    setState("processing");
    const base64 = capturedDataUrl.split(",")[1] ?? capturedDataUrl;
    try {
      await onCapture(base64);
      // Parent navigates on success. If we get here, parent didn't —
      // reset to live so the user can try another shot.
      retake();
    } catch {
      // Parent should display its own error; we just reset.
      retake();
    }
  }

  function handleFileFallback(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result);
      const base64 = result.split(",")[1] ?? result;
      setState("processing");
      try {
        await onCapture(base64);
      } finally {
        // Parent navigates on success; reset our local state regardless.
        setState((s) => (s === "processing" ? "fallback" : s));
      }
    };
    reader.readAsDataURL(file);
  }

  // ---- Rendering branches ----

  // Intro — pre-permission. Show context, let user opt in.
  if (state === "intro") {
    return (
      <div className="rounded-3xl overflow-hidden border border-ink/10 bg-ink/90 text-cream p-8 text-center aspect-[3/4] flex flex-col justify-center items-center">
        <div className="font-display text-2xl leading-tight mb-3">
          Use your camera
        </div>
        <p className="text-sm text-cream/70 mb-6 max-w-[240px]">
          We&apos;ll ask for camera access — only used while you&apos;re here,
          never sent anywhere except as part of the scan.
        </p>
        <button
          type="button"
          onClick={startCamera}
          className="px-6 py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
        >
          Enable camera
        </button>
        <FileFallbackLink onFile={handleFileFallback} label="Or upload a photo" />
      </div>
    );
  }

  if (state === "starting") {
    return (
      <div className="rounded-3xl overflow-hidden bg-ink/90 text-cream aspect-[3/4] flex items-center justify-center">
        <p className="text-sm text-cream/70 animate-pulse">Starting camera…</p>
      </div>
    );
  }

  // Live + captured share the same viewport scaffold so the corner
  // brackets stay registered to the same pixels during the freeze.
  if (state === "live" || state === "captured" || state === "processing") {
    return (
      <div className="relative rounded-3xl overflow-hidden bg-ink aspect-[3/4]">
        {/* Video stream — kept mounted in `captured` state so retake is instant.
            object-cover fills the 3:4 frame without letterboxing. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Frozen capture overlay — shown only when captured */}
        {state !== "live" && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Bracket guides + hint — live state only */}
        {state === "live" && (
          <>
            <BracketOverlay />
            <p className="absolute top-6 left-0 right-0 text-center text-cream/85 text-sm font-mono uppercase tracking-widest">
              Frame the label
            </p>
          </>
        )}

        {/* Processing overlay — semi-opaque on top of the frozen capture */}
        {(state === "processing" || busy) && (
          <div className="absolute inset-0 bg-ink/70 flex items-center justify-center backdrop-blur-sm">
            <p className="text-cream font-display text-xl animate-pulse">
              Reading the label…
            </p>
          </div>
        )}

        {/* Action bar — pinned to the bottom of the viewport. Capture
            button in live state, Use/Retake in captured state. */}
        <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4">
          {state === "live" && (
            <button
              type="button"
              onClick={capture}
              aria-label="Capture"
              className="w-16 h-16 rounded-full bg-cream border-4 border-cream/40 active:scale-95 transition shadow-lg"
            />
          )}
          {state === "captured" && (
            <>
              <button
                type="button"
                onClick={retake}
                className="flex-1 max-w-[140px] py-3 rounded-xl border border-cream/30 text-cream font-medium hover:bg-cream/10 transition"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={confirm}
                className="flex-1 max-w-[140px] py-3 rounded-xl bg-emerald text-cream font-medium hover:bg-emerald/90 transition"
              >
                Use this
              </button>
            </>
          )}
        </div>

        {/* Hidden canvas for the capture compositing step */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>
    );
  }

  // Error — camera failed. Show the message + file fallback inline.
  if (state === "error") {
    stopStream();
    return (
      <div className="rounded-3xl border border-burgundy/30 bg-burgundy/5 p-8 text-center aspect-[3/4] flex flex-col justify-center items-center">
        <p className="font-display text-xl text-ink mb-2">Camera blocked</p>
        <p className="text-sm text-slate mb-6 max-w-[260px] leading-relaxed">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={startCamera}
          className="px-6 py-3 rounded-xl border border-ink/15 text-ink font-medium hover:bg-ink/5 transition mb-3"
        >
          Try the camera again
        </button>
        <FileFallbackLink onFile={handleFileFallback} label="Upload a photo" inline />
      </div>
    );
  }

  // Fallback — no media API available. Pure file input.
  return (
    <label className="block rounded-3xl border border-ink/10 bg-ink/90 text-cream aspect-[3/4] flex flex-col items-center justify-center cursor-pointer p-8 text-center">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileFallback(f);
        }}
      />
      <div className="font-display text-2xl mb-3">
        {busy ? "Reading the label…" : "Tap to upload"}
      </div>
      <p className="text-sm text-cream/70 max-w-[240px]">
        Your browser doesn&apos;t support live camera capture. Pick a photo
        instead.
      </p>
    </label>
  );
}

// Bracket corners — four 22px L-shapes registered to the inner 70% of the
// viewport. SVG strokes so they scale crisply at any DPI.
function BracketOverlay() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {/* Each bracket is an L drawn from a corner of the safe rectangle.
          x/y coords are percent of the viewport. */}
      <g stroke="#F4EFE6" strokeWidth="0.6" fill="none" strokeLinecap="round">
        {/* Top-left */}
        <path d="M 12 22 L 12 12 L 22 12" />
        {/* Top-right */}
        <path d="M 78 12 L 88 12 L 88 22" />
        {/* Bottom-left */}
        <path d="M 12 78 L 12 88 L 22 88" />
        {/* Bottom-right */}
        <path d="M 78 88 L 88 88 L 88 78" />
      </g>
    </svg>
  );
}

// Inline file-input link used in the intro and error states. Keeps the
// fallback affordance reachable without leaving the viewport.
function FileFallbackLink({
  onFile,
  label,
  inline = false,
}: {
  onFile: (f: File) => void;
  label: string;
  inline?: boolean;
}) {
  return (
    <label
      className={`${
        inline ? "text-slate hover:text-ink" : "text-cream/70 hover:text-cream mt-4"
      } text-xs font-mono uppercase tracking-widest underline underline-offset-4 cursor-pointer transition`}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {label}
    </label>
  );
}
