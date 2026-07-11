"use client";

// CameraCapture — full-screen native-camera-style scan UI.
//
// Layout matches the Figma design (node 23:1879):
//   - Top bar: X close (left) + flash toggle (right). Cream background.
//   - Middle: cream viewport. In intro state, glass card overlays with
//     "Use your camera" prompt + Enable camera + OR UPLOAD A PHOTO. In
//     live state, the video stream fills the middle. In captured /
//     processing, the frozen frame fills the middle.
//   - Bottom tray: gallery thumbnail (left, opens file picker) + emerald
//     shutter (center) + camera switch (right). Cream background.
//
// State machine:
//   intro      — pre-permission. Glass card prompts the user. Tapping the
//                shutter OR the Enable camera button starts the camera.
//   starting   — getUserMedia request in flight (brief, usually <1s).
//   live       — stream attached, viewport active, shutter armed.
//   captured   — frame frozen on canvas (visible during processing).
//   processing — onCapture callback running. Parent routes to result.
//   error      — getUserMedia failed (denial, no device). Glass card
//                shows the message + fallback path (upload).
//   fallback   — no mediaDevices API. Glass card prompts upload only.
//
// Parent contract: pass `onCapture(base64)`. The base64 is stripped of
// the `data:image/jpeg;base64,` prefix to match /api/scan's expected
// shape. Tap-to-scan is immediate: capture → process → parent navigates,
// no intermediate Use this / Retake step.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | "intro"
  | "starting"
  | "live"
  | "captured"
  | "processing"
  | "error"
  | "fallback";

type FacingMode = "environment" | "user";

interface Props {
  /** Called with raw base64 (no data: prefix) once a frame is captured. */
  onCapture: (base64: string) => Promise<void> | void;
  /** When true, shows a processing overlay regardless of internal state. */
  busy?: boolean;
}

// `torch` isn't in the lib.dom.d.ts shape for MediaTrackCapabilities /
// MediaTrackConstraintSet, but it's a real (widely shipped) constraint
// on Chromium-based mobile browsers. We narrow with a cast at each use
// site to avoid polluting global types.
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

export function CameraCapture({ onCapture, busy = false }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("intro");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Detect API support once on mount. SSR-friendly: first paint is always
  // "intro"; the fallback flip happens after hydration.
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState("fallback");
    }
  }, []);

  // Stop the camera on unmount. Forgetting this leaks the device LED and
  // browser indicator between scans.
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

  // Internal: spin up getUserMedia with the current facingMode. Used by
  // both startCamera() and switchCamera() so the constraint shape stays
  // in one place.
  const requestStream = useCallback(
    async (mode: FacingMode): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          // 1280x720 is plenty for OCR; higher inflates the base64 payload
          // without measurably improving GPT-4o accuracy.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    },
    [],
  );

  // Check whether the active track exposes a torch capability. We only
  // surface the flash toggle if it does — most desktop webcams and some
  // mobile browsers don't expose it.
  const detectFlashSupport = useCallback((stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== "function") {
      setFlashSupported(false);
      return;
    }
    const caps = track.getCapabilities() as TorchCapabilities;
    setFlashSupported(Boolean(caps.torch));
  }, []);

  async function startCamera() {
    setState("starting");
    setErrorMessage(null);
    try {
      const stream = await requestStream(facingMode);
      streamRef.current = stream;
      detectFlashSupport(stream);
      // Don't attach the stream here — the <video> element only renders
      // when state advances to "live"/"captured"/"processing". The effect
      // below watches `state` and attaches once the element mounts.
      setState("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "Unknown";
      setErrorMessage(
        name === "NotAllowedError"
          ? "Camera permission was denied. You can still upload a photo."
          : name === "NotFoundError"
          ? "No camera found on this device. Upload a photo instead."
          : "Couldn't start the camera. Upload a photo instead.",
      );
      setState("error");
    }
  }

  // Attach the live stream to the video element AFTER it mounts. The old
  // bug (silent black viewport) was caused by attaching before the video
  // element existed in the DOM; this effect fires the moment it does.
  useEffect(() => {
    if (state !== "live" && state !== "captured" && state !== "processing") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject === stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      /* play() can reject on iOS without a fresh gesture — non-fatal */
    });
  }, [state]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl || dataUrl.length < 1000) return;
    setCapturedDataUrl(dataUrl);
    setState("processing");
    video.pause();
    const base64 = dataUrl.split(",")[1] ?? dataUrl;
    void Promise.resolve(onCapture(base64)).catch(() => {
      // Parent surfaces its own error; reset so the user can try again.
      setState("live");
      setCapturedDataUrl(null);
      videoRef.current?.play().catch(() => {});
    });
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result);
      const base64 = result.split(",")[1] ?? result;
      setCapturedDataUrl(result);
      setState("processing");
      try {
        await onCapture(base64);
        // Parent navigates on match. On miss, parent unmounts this
        // component; either way nothing more to do.
      } catch {
        setState("intro");
        setCapturedDataUrl(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function openGallery() {
    fileInputRef.current?.click();
  }

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !flashOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as TorchConstraint],
      });
      setFlashOn(next);
    } catch {
      // Some browsers advertise torch capability but reject applyConstraints
      // — silently hide the affordance going forward.
      setFlashSupported(false);
    }
  }

  async function switchCamera() {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    // Stop the current stream before requesting a new one — keeps the
    // device's camera indicator from flickering between two open streams.
    stopStream();
    setFlashOn(false);
    setFacingMode(next);
    try {
      const stream = await requestStream(next);
      streamRef.current = stream;
      detectFlashSupport(stream);
      // Force a re-attach by toggling state out and back — videoRef is
      // already mounted, so we just need the attach effect to fire again.
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    } catch {
      setErrorMessage("Couldn't switch cameras on this device.");
      setState("error");
    }
  }

  function close() {
    stopStream();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  // ---- Render ----

  // Shutter behavior depends on state: in intro it starts the camera, in
  // live it captures. Other states render the shutter as a visual element
  // (intentionally inactive — capture is mid-flight).
  const shutterAction =
    state === "intro" ? startCamera : state === "live" ? capture : undefined;
  const shutterDisabled = !shutterAction || state === "starting";

  return (
    // Camera takeover ends at bottom-28 (112px) so the floating nav pill
    // (24px from bottom + ~80px tall = ~104px occupied) stays visible
    // and tappable while scanning. Earlier this was `inset-0` and the
    // nav self-hid on /scan; new behavior keeps the nav accessible so
    // users can bail to another tab mid-scan without backing out first.
    <div className="fixed inset-x-0 top-0 bottom-28 z-50 bg-cream flex flex-col">
      {/* Top bar — solid cream, X left, flash right. Flash only when live + supported. */}
      <header className="flex items-center justify-between px-6 py-2 bg-cream shrink-0">
        <button
          type="button"
          onClick={close}
          aria-label="Close scanner"
          className="w-8 h-8 flex items-center justify-center text-ink hover:text-emerald transition"
        >
          <CloseIcon />
        </button>

        {state === "live" && flashSupported ? (
          <button
            type="button"
            onClick={toggleFlash}
            aria-label={flashOn ? "Turn flash off" : "Turn flash on"}
            aria-pressed={flashOn}
            className="w-6 h-6 flex items-center justify-center text-ink hover:text-emerald transition"
          >
            {flashOn ? <FlashOnIcon /> : <FlashOffIcon />}
          </button>
        ) : (
          /* Reserve the space so the X stays anchored left */
          <span aria-hidden className="w-6 h-6" />
        )}
      </header>

      {/* Middle viewport — fills the space between top bar and bottom tray. */}
      <div className="flex-1 relative overflow-hidden bg-cream">
        {/* Live video — kept mounted across live/captured/processing so the
            same DOM node is reused and the stream doesn't tear. */}
        {(state === "live" || state === "captured" || state === "processing") && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Frozen capture — overlays the video during captured/processing. */}
        {(state === "captured" || state === "processing") && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Glass card — intro state. Centered on the cream viewport. */}
        {state === "intro" && (
          <GlassCard>
            <h1 className="font-display text-2xl text-ink leading-tight text-center">
              Use your camera
            </h1>
            <p className="text-[13px] font-light text-ink/80 text-center leading-snug">
              We&apos;ll ask for camera access. Only used while you&apos;re here,
              never sent anywhere except as part of the scan.
            </p>
            <button
              type="button"
              onClick={startCamera}
              className="px-8 py-3 rounded-md bg-emerald text-cream text-base font-light hover:bg-emerald/90 transition"
            >
              Enable camera
            </button>
            <button
              type="button"
              onClick={openGallery}
              className="text-[13px] font-light uppercase tracking-wider text-ink hover:text-emerald transition"
            >
              Or upload a photo
            </button>
          </GlassCard>
        )}

        {/* Starting — brief flash of state during getUserMedia. */}
        {state === "starting" && (
          <GlassCard>
            <p className="text-sm font-light text-ink/70 animate-pulse">
              Starting camera…
            </p>
          </GlassCard>
        )}

        {/* Processing — overlays the frozen capture with a status message. */}
        {(state === "processing" || busy) && (
          <div className="absolute inset-0 bg-ink/60 flex items-center justify-center backdrop-blur-sm">
            <p className="text-cream font-display text-2xl animate-pulse">
              Reading the label…
            </p>
          </div>
        )}

        {/* Error — covers the viewport with a glass card explaining the
            failure and offering upload as a fallback. */}
        {state === "error" && (
          <GlassCard>
            <h1 className="font-display text-2xl text-ink leading-tight text-center">
              Camera blocked
            </h1>
            <p className="text-[13px] font-light text-ink/80 text-center leading-snug max-w-[260px]">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={startCamera}
              className="px-6 py-2.5 rounded-md border border-ink/20 text-ink text-sm font-light hover:bg-ink/5 transition"
            >
              Try the camera again
            </button>
            <button
              type="button"
              onClick={openGallery}
              className="text-[13px] font-light uppercase tracking-wider text-ink hover:text-emerald transition"
            >
              Or upload a photo
            </button>
          </GlassCard>
        )}

        {/* Fallback — no media API. Upload-only glass card. */}
        {state === "fallback" && (
          <GlassCard>
            <h1 className="font-display text-2xl text-ink leading-tight text-center">
              Upload a photo
            </h1>
            <p className="text-[13px] font-light text-ink/80 text-center leading-snug max-w-[260px]">
              Your browser doesn&apos;t support live camera capture. Pick a
              photo from your library instead.
            </p>
            <button
              type="button"
              onClick={openGallery}
              className="px-8 py-3 rounded-md bg-emerald text-cream text-base font-light hover:bg-emerald/90 transition"
            >
              Choose a photo
            </button>
          </GlassCard>
        )}
      </div>

      {/* Bottom tray — gallery / shutter / switch. Hidden in error +
          fallback since the live camera affordances don't apply.
          3-column grid (not flex justify-center) so the shutter sits at
          true horizontal center regardless of the gallery/switch button
          widths. With flex+gap the group was centered, which pushed the
          shutter ~8px right of center because the right button is
          narrower than the left. */}
      {state !== "error" && state !== "fallback" && (
        <div className="grid grid-cols-3 items-center px-8 py-4 bg-cream shrink-0">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={openGallery}
              aria-label="Upload from gallery"
              className="w-12 h-12 rounded-full overflow-hidden bg-ink/5 border border-ink/10 flex items-center justify-center text-ink hover:bg-ink/10 transition"
            >
              <GalleryIcon />
            </button>
          </div>

          <div className="flex justify-center">
            <ShutterButton
              onActivate={shutterAction}
              disabled={shutterDisabled}
              label={state === "live" ? "Capture" : "Enable camera"}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={state === "live" ? switchCamera : undefined}
              disabled={state !== "live"}
              aria-label="Switch camera"
              className="w-8 h-8 flex items-center justify-center text-ink hover:text-emerald transition disabled:opacity-40"
            >
              <SwitchCameraIcon />
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input — single source of truth for gallery picks.
          Both the "OR UPLOAD A PHOTO" link and the gallery thumbnail
          trigger it via ref. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Clear so selecting the same file again still fires onChange.
          e.target.value = "";
          if (f) handleFile(f);
        }}
      />

      {/* Hidden canvas for the capture compositing step */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </div>
  );
}

// ---- Helpers ----

// Centered glass card used by intro, starting, error, and fallback
// states. The backdrop-blur lifts it off the cream background even though
// there's no contrasting video underneath (intent: matches the design's
// "floating panel" feel regardless of what's behind it).
// Shutter — Josh's Figma SVGs ("Camera Button" / "Camera Button
// Depressed"). The two files are identical except the green center
// circle radius (31.2647 normal → 29.5 depressed), so we render ONE
// inline SVG and animate that circle instead of swapping images: on
// press the center quickly shrinks to the depressed radius, then snaps
// back (keyframes in globals.css, .shutter-center-pressed). Animation
// starts on pointerdown for immediacy; capture still fires on click.
// The 96px viewBox carries 12px of built-in shadow padding around the
// 72px button face, so -my-3 keeps the tray the same height as the old
// 72px flat button.
function ShutterButton({
  onActivate,
  disabled,
  label,
}: {
  onActivate?: () => void;
  disabled?: boolean;
  label: string;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onActivate}
      onPointerDown={() => {
        if (!disabled) setPressed(true);
      }}
      disabled={disabled}
      aria-label={label}
      className="w-24 h-24 -my-3 disabled:opacity-50 transition"
    >
      <svg
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden
      >
        <g filter="url(#shutter-shadow)">
          <circle cx="48" cy="48" r="36" fill="url(#shutter-metal)" />
          <circle cx="48" cy="48" r="35.5" stroke="#114821" />
        </g>
        <circle
          cx="48"
          cy="48"
          r="31.2647"
          fill="#114821"
          stroke="#114821"
          className={`shutter-center${pressed ? " shutter-center-pressed" : ""}`}
          onAnimationEnd={() => setPressed(false)}
        />
        <defs>
          <filter
            id="shutter-shadow"
            x="0"
            y="0"
            width="96"
            height="96"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology
              radius="4"
              operator="dilate"
              in="SourceAlpha"
              result="effect1_dropShadow"
            />
            <feOffset />
            <feGaussianBlur stdDeviation="4" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0"
            />
            <feBlend
              mode="normal"
              in2="BackgroundImageFix"
              result="effect1_dropShadow"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_dropShadow"
              result="shape"
            />
          </filter>
          <radialGradient
            id="shutter-metal"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(48 48) rotate(90) scale(36)"
          >
            <stop stopColor="#BDBDBD" />
            <stop offset="1" stopColor="#D7D7D7" />
          </radialGradient>
        </defs>
      </svg>
    </button>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="bg-cream/40 backdrop-blur-xl rounded px-2 py-4 flex flex-col items-center gap-3 max-w-[280px]">
        {children}
      </div>
    </div>
  );
}

// ---- Icons (inline SVG to avoid adding a dependency) ----

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function FlashOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden
    >
      <path d="M13 2L7 14h5l-2 8" opacity="0.55" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

function FlashOnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden
    >
      <path d="M13 2L7 14h5l-2 8 8-12h-5l2-8z" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="M21 17l-5-5-6 6-3-3-4 4" />
    </svg>
  );
}

function SwitchCameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      <path d="M3 9V7a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v2" />
      <path d="M21 15v2a2 2 0 0 1-2 2h-2.5l-1.5 2h-6l-1.5-2H5a2 2 0 0 1-2-2v-2" />
      <path d="M16 11l3 3-3 3" />
      <path d="M8 13l-3-3 3-3" />
    </svg>
  );
}
