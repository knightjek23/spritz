"use client";

// CardMenu — the kebab (•••) trigger and the bottom-sheet menu it opens.
//
// Reference: Josh's Figma "Blue Talisman / Ex Nihilo" mock. Rounded-square
// kebab sits in the top-right of the card; tap opens a bottom sheet with a
// drag-handle pill, a preview of the card itself, and a vertical list of
// 6 actions: Like, Dislike, Share, Buy, Find Dupe, Delete.
//
// The component owns the open/closed state and the action dispatch. The
// parent passes the fragrance metadata + (for shelf cards) the collection
// item id so Delete can target it.
//
// Stub items (Like / Dislike) show a quiet toast and a TODO comment — we
// can wire real backing once we add a likes/reactions table. Share uses
// the Web Share API with a clipboard fallback. Buy and Find Dupe just
// navigate. Delete calls the existing collection DELETE endpoint and
// fires the onDelete callback so the parent can refresh its list.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface CardMenuProps {
  fragrance: {
    id: string;
    name: string;
    house: string;
    bottle_image_url?: string | null;
  };
  /** Present for shelf cards; absent (and Delete hidden) on trending cards. */
  collectionItemId?: string;
  /** Called after a successful Delete so the parent can refetch its list. */
  onDelete?: () => void;
}

type ToastState = { message: string; tone: "neutral" | "error" } | null;

export function CardMenu({ fragrance, collectionItemId, onDelete }: CardMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Mounted gate for createPortal — document.body doesn't exist during
  // SSR, and even though this is a "use client" component, hydration runs
  // before the first user interaction. Flip mounted = true after the first
  // client render so the portal target is guaranteed available before we
  // try to render into it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while sheet is open so the page underneath
  // doesn't drift when the user drags around the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes the sheet — keyboard parity with the backdrop tap.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Toast auto-dismiss after 2.5s so the user isn't left looking at a
  // banner they've already absorbed.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const close = () => setOpen(false);

  // ----- Actions -----

  const onLike = () => {
    // TODO: persist to a reactions table. For now, optimistic toast so
    // the user knows the menu worked even before infra exists.
    setToast({ message: "Liked. (We'll save these soon.)", tone: "neutral" });
    close();
  };

  const onDislike = () => {
    setToast({ message: "Noted. (We'll save these soon.)", tone: "neutral" });
    close();
  };

  const onShare = async () => {
    const url = `${window.location.origin}/fragrance/${fragrance.id}`;
    const shareData = {
      title: `${fragrance.name} by ${fragrance.house}`,
      text: `Check out ${fragrance.name} on Spritz`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setToast({ message: "Link copied", tone: "neutral" });
      }
    } catch (err) {
      // User dismissed the share sheet — not an error worth surfacing.
      if ((err as Error).name === "AbortError") return;
      setToast({ message: "Couldn't share. Link copied instead.", tone: "neutral" });
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
    }
    close();
  };

  const onBuy = () => {
    close();
    router.push(`/api/buy/${fragrance.id}`);
  };

  const onFindDupe = () => {
    close();
    // Anchor to the Known Dupes section on the detail page so the user
    // lands directly on what they asked for.
    router.push(`/fragrance/${fragrance.id}#dupes`);
  };

  const onDeleteAction = async () => {
    if (!collectionItemId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collection?id=${collectionItemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setToast({
          message: body?.error === "unauthorized" ? "Sign in to manage your shelf" : "Couldn't remove. Try again.",
          tone: "error",
        });
        setBusy(false);
        return;
      }
      // Parent refetches the list so the row disappears.
      onDelete?.();
      close();
    } catch {
      setToast({ message: "Couldn't remove. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  // ----- Render -----

  return (
    <>
      {/* Kebab trigger — stopPropagation so taps don't bubble to the
          parent card link. Sized 32x32 to match the Figma rounded-square
          frame; inherits ink color so the dots stay legible on cream. */}
      <button
        type="button"
        aria-label="More options"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="shrink-0 w-8 h-8 rounded-lg border border-ink/15 flex items-center justify-center text-ink/70 hover:bg-ink/5 hover:text-ink transition"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="4" cy="10" r="1" fill="currentColor" />
          <circle cx="10" cy="10" r="1" fill="currentColor" />
          <circle cx="16" cy="10" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Bottom sheet + toast are portaled to document.body so they
          escape any ancestor transform/filter context (the kebab is
          wrapped in `-translate-y-1/2` on the shelf row, which would
          otherwise make `position: fixed` resolve relative to that 32px
          wrapper instead of the viewport — sheet would render as a
          narrow column next to the kebab, and the backdrop wouldn't
          cover the page so outside taps couldn't dismiss). */}
      {mounted &&
        createPortal(
          <>
            {open && (
              <div
                className="fixed inset-0 z-[60] flex flex-col justify-end"
                onClick={close}
              >
                {/* Backdrop — soft scrim, ink at low opacity so the cream
                    still reads through. Click anywhere outside the sheet
                    to dismiss. */}
                <div className="absolute inset-0 bg-ink/30" aria-hidden />

                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Options for ${fragrance.name}`}
                  onClick={(e) => e.stopPropagation()}
                  className="relative bg-cream rounded-t-3xl pt-2 pb-6 shadow-2xl animate-spritz-sheet-rise mx-auto w-full max-w-md"
                >
                  {/* Drag handle pill — affordance even though we're not
                      wiring real drag-to-dismiss yet. */}
                  <div
                    className="mx-auto w-10 h-1 rounded-full bg-ink/20 mb-3"
                    aria-hidden
                  />

                  {/* Card preview — same layout as the shelf row so the
                      user knows exactly which fragrance the menu is
                      operating on. */}
                  <div className="mx-4 mb-2 flex items-center gap-3 px-3 py-3 rounded-2xl bg-paper border border-ink/10">
                    {fragrance.bottle_image_url ? (
                      <div className="shrink-0 w-12 h-16 relative isolate">
                        <Image
                          src={fragrance.bottle_image_url}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-contain mix-blend-multiply"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-12 h-16 rounded bg-ink/5" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg leading-tight truncate">
                        {fragrance.name}
                      </div>
                      <div className="text-sm text-slate truncate">
                        {fragrance.house}
                      </div>
                    </div>
                  </div>

                  {/* Menu list. Each item is a full-width row, large tap
                      target, inherits ink color so icons can use
                      currentColor and match the label tone. */}
                  <ul className="px-2">
                    <MenuItem icon={<HeartIcon />} label="Like" onClick={onLike} />
                    <MenuItem
                      icon={<ThumbsDownIcon />}
                      label="Dislike"
                      onClick={onDislike}
                    />
                    <MenuItem icon={<AtomIcon />} label="Share" onClick={onShare} />
                    <MenuItem icon={<DoorIcon />} label="Buy" onClick={onBuy} />
                    <MenuItem
                      icon={<DropletIcon />}
                      label="Find Dupe"
                      onClick={onFindDupe}
                    />
                    {collectionItemId && (
                      <MenuItem
                        icon={<CircleXIcon />}
                        label={busy ? "Removing…" : "Delete"}
                        onClick={onDeleteAction}
                        disabled={busy}
                        tone="danger"
                      />
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* Toast — fixed near the top so it doesn't get covered by
                the bottom nav. Only renders when a stub action fires or
                share/delete needs to surface a result. */}
            {toast && (
              <div
                role="status"
                className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full text-sm shadow-lg ${
                  toast.tone === "error"
                    ? "bg-ink text-cream"
                    : "bg-cream text-ink border border-ink/10"
                }`}
              >
                {toast.message}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}

// ---------- Menu item row ----------

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-ink hover:bg-ink/5" : "text-ink hover:bg-ink/5";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition disabled:opacity-50 ${toneClass}`}
      >
        <span className="shrink-0 w-7 h-7 flex items-center justify-center text-ink/80">
          {icon}
        </span>
        <span className="text-base font-medium">{label}</span>
      </button>
    </li>
  );
}

// ---------- Inline icons ----------
// Same geometry as the SVGs Josh provided, scaled to 24x24 viewport,
// using currentColor so they pick up the menu-item text color.

function HeartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M3.95647 8.5118C3.11569 9.73437 2.66555 11.1832 2.66553 12.667C2.66553 15.7337 4.66568 18.0003 6.66583 20.0004L14.0104 27.1098C14.2625 27.3919 14.5717 27.6173 14.9175 27.7707C15.2634 27.9242 15.6379 28.0024 16.0163 28C16.3946 27.9976 16.7682 27.9147 17.112 27.7568C17.4559 27.599 17.7622 27.3698 18.0107 27.0844L25.3339 20.0004C27.3341 18.0003 29.3342 15.7203 29.3342 12.667C29.3413 11.18 28.8953 9.72606 28.0556 8.49878C27.2159 7.2715 26.0223 6.32905 24.6337 5.79687C23.2451 5.26468 21.7273 5.168 20.2824 5.51969C18.8375 5.87138 17.5339 6.65476 16.5453 7.76557C16.4754 7.84026 16.391 7.8998 16.2971 7.94051C16.2033 7.98122 16.1022 8.00222 15.9999 8.00222C15.8976 8.00222 15.7964 7.98122 15.7026 7.94051C15.6088 7.8998 15.5244 7.84026 15.4545 7.76557C14.4627 6.66194 13.1595 5.88508 11.7169 5.53761C10.2743 5.19014 8.76026 5.2884 7.3747 5.81942C5.98914 6.35044 4.79726 7.28923 3.95647 8.5118Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M10.9999 14.0001V26.0006M19.0004 9.87985L18.0003 14.0001H23.8307C24.1412 14.0001 24.4474 14.0724 24.7251 14.2113C25.0029 14.3502 25.2444 14.5518 25.4307 14.8002C25.6171 15.0486 25.743 15.337 25.7985 15.6425C25.8541 15.948 25.8377 16.2623 25.7508 16.5605L23.4206 24.561C23.2995 24.9764 23.0468 25.3414 22.7006 25.6011C22.3544 25.8607 21.9333 26.0011 21.5005 26.0011H7.99974C7.46926 26.0011 6.96051 25.7903 6.58541 25.4153C6.21031 25.0402 5.99963 24.5314 5.99963 24.0009V16.0003C5.99963 15.4698 6.21031 14.9611 6.58541 14.586C6.96051 14.2109 7.46926 14.0001 7.99974 14.0001H10.7599C11.132 14 11.4966 13.896 11.8128 13.6999C12.1291 13.5038 12.3844 13.2233 12.5499 12.8901L16.0002 5.99951C16.4718 6.00536 16.936 6.11772 17.358 6.32813C17.7801 6.53854 18.1492 6.84168 18.4377 7.21483C18.7262 7.58798 18.9267 8.02151 19.0241 8.48293C19.1215 8.94436 19.1133 9.42191 19.0004 9.87985Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AtomIcon() {
  // The "atom" icon Josh uses for Share — three small nodes connected
  // by elliptical orbits. Pulled from public/icons/atom.svg geometry.
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      <ellipse cx="16" cy="16" rx="11" ry="4" stroke="currentColor" strokeWidth="1.2" />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="4"
        stroke="currentColor"
        strokeWidth="1.2"
        transform="rotate(60 16 16)"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="11"
        ry="4"
        stroke="currentColor"
        strokeWidth="1.2"
        transform="rotate(120 16 16)"
      />
    </svg>
  );
}

function DoorIcon() {
  // "Buy" — doorway / storefront. Simple arch + base.
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M7 27V11a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v16M4 27h24M19 17.5h.01"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DropletIcon() {
  // "Find Dupe" — droplet shape, the canonical Spritz fragrance glyph.
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 4s-9 10.5-9 16a9 9 0 1 0 18 0c0-5.5-9-16-9-16Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CircleXIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
       