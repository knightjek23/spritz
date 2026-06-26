"use client";

// Bottom navigation bar — mobile-first, primary destination switcher.
//
// Matches Figma node 58:12: 5 tabs (Home, Shelf, Scan, Encyclopedia,
// Profile), Roboto ExtraLight 10px labels, paper bg with subtle white
// top border + backdrop blur, and an iOS-style home-indicator strip at
// the bottom for devices with on-screen home bars.
//
// Mapping app features to the 5 tabs:
//   - Home          → /              (marketing home or For You feed)
//   - Shelf         → /collection    (Own / Tried / Wishlist)
//   - Scan          → /scan          (full-screen camera takeover)
//   - Encyclopedia  → /encyclopedia  (hub: trending + by note / house / family)
//   - Profile       → /account       (plan, usage, sign-out)
//
// Active state: the icon + label switch to emerald when the user is on
// (or under) that tab's route. usePathname drives this so the active
// state updates on client navigation without a full reload.
//
// Visibility: hidden on /scan (the camera is a full-bleed surface and a
// nav strip at the bottom would conflict with the shutter tray).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiquidGlass } from "./liquid-glass/LiquidGlass";

interface Tab {
  href: string;
  label: string;
  /** Routes considered "under" this tab — any pathname starting with one
   *  of these matches as active. Lets /collection?tab=own light up Shelf,
   *  and /fragrance/[id] or /note/[slug] light up Encyclopedia. */
  matchPrefixes: string[];
  icon: (active: boolean) => React.ReactNode;
}

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    matchPrefixes: ["/"],
    icon: (active) => <HomeIcon active={active} />,
  },
  {
    href: "/collection",
    label: "Shelf",
    matchPrefixes: ["/collection"],
    icon: (active) => <ShelfIcon active={active} />,
  },
  {
    href: "/scan",
    label: "Scan",
    matchPrefixes: ["/scan"],
    icon: (active) => <ScanIcon active={active} />,
  },
  {
    href: "/encyclopedia",
    label: "Encyclopedia",
    matchPrefixes: [
      "/encyclopedia",
      "/families",
      "/family",
      "/houses",
      "/house",
      "/notes",
      "/note",
      "/fragrance",
      "/search",
    ],
    icon: (active) => <EncyclopediaIcon active={active} />,
  },
  {
    href: "/account",
    label: "Profile",
    matchPrefixes: ["/account", "/welcome", "/pricing"],
    icon: (active) => <ProfileIcon active={active} />,
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  // Hide on the camera takeover. The CameraCapture component uses fixed
  // positioning to cover the whole viewport, including the bottom tray
  // where the shutter lives — the nav would land on top of it.
  if (pathname.startsWith("/scan")) return null;

  return (
    // Liquid-glass bottom nav. Preset 'bottom-nav' defaults to a 32px
    // pill radius (Instagram-style floating bar), but Spritz's existing
    // shape is full-width edge-to-edge — so we override radius to 0 and
    // keep the border-top for definition against the page. The paper
    // tint sits over the displacement layer so labels and icons stay
    // legible regardless of what's behind them.
    <LiquidGlass
      as="nav"
      preset="bottom-nav"
      radius={0}
      // Custom nav-tuned displacement (scale 70 with tighter noise) so
      // the refraction is visible on mobile instead of reading as flat
      // blur. Blur bumped to 4px to soften the displacement edges.
      filter="lg-glass-nav"
      blur={4}
      // Tint dropped from 0.65 → 0.45 so more of what's behind shows
      // through and the wobble is actually visible.
      tint="rgba(242,237,228,0.45)"
      // Paper-toned rim matches the tint RGB so the glass edge sits
      // tonally with the bar instead of bright white against paper.
      edgeColor="242, 237, 228"
      role="navigation"
      aria-label="Primary"
      // Inline positioning so fixed always wins regardless of any
      // ancestor that may have inadvertently created a containing block.
      style={{ position: "fixed", bottom: 0, left: 0, right: 0 }}
      className="z-40 border-t border-white/20"
    >
      <ul className="flex items-start justify-between px-2 pt-3">
        {TABS.map((tab) => {
          const active = isActiveTab(pathname, tab);
          return (
            <li key={tab.href} className="flex-1 min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1.5 py-1 group"
              >
                <span
                  className={`flex items-center justify-center w-8 h-8 ${
                    active ? "text-emerald" : "text-ink/85"
                  } transition-colors`}
                >
                  {tab.icon(active)}
                </span>
                <span
                  className={`text-[10px] font-light text-center whitespace-nowrap ${
                    active ? "text-emerald font-medium" : "text-ink/85"
                  } transition-colors`}
                  style={{ fontVariationSettings: '"wdth" 100' }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Home-indicator area — matches the iOS home bar height so the
          nav reads as part of the OS chrome on supporting devices. The
          white pill is purely decorative; iOS draws its own over the top. */}
      <div className="flex items-center justify-center h-[34px]">
        <div className="bg-white/30 h-[5px] w-[134px] rounded-full" aria-hidden />
      </div>
    </LiquidGlass>
  );
}

// Active-state matcher. "/" is special: only matches when pathname is
// EXACTLY "/" so it doesn't light up on every page. Every other tab
// matches when pathname starts with any of its prefixes (with a trailing
// slash or boundary so /house doesn't match /houses incorrectly).
function isActiveTab(pathname: string, tab: Tab): boolean {
  if (tab.href === "/") return pathname === "/";
  return tab.matchPrefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?"),
  );
}

// ===== Icons =====
// Inline SVGs sourced directly from the Spritz Iconography brand
// reference (Figma node 61:4). The original Figma exports hardcoded
// stroke="#2C2420" and (for the scan corner brackets) fill="#2C2420";
// those were swapped to currentColor here so the wrapping span's text
// color (ink/85 inactive, emerald active) themes the icons in place.
//
// Cream fills in the encyclopedia icon (fill="#FAF6ED" on the figure
// bodies) were swapped to fill="none" so active-state recoloring
// doesn't leave cream rectangles overlaying the emerald outlines.
//
// Home icon stays inline-drawn — the Figma upload didn't include a
// Home SVG. Drop the file into public/icons/home.svg and swap when
// available.
//
// Stroke widths preserved from the Figma source (0.5 for the
// continuous-path icons, 0.66 for the multi-shape ones). The "active"
// state is color-only — no stroke bump, to honor the 1px ultra-light
// brand guideline.

function HomeIcon({ active: _active }: { active: boolean }) {
  // Placeholder until the brand Home SVG is delivered.
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-8 h-8"
      aria-hidden
    >
      <path d="M5 14L16 6l11 8" />
      <path d="M7 13v13h18V13" />
    </svg>
  );
}

function ShelfIcon({ active: _active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-8 h-8"
      aria-hidden
    >
      <path
        d="M16.0001 15.9999V11.9996C16.0001 11.646 15.8596 11.3068 15.6096 11.0567C15.3596 10.8067 15.0205 10.6662 14.6669 10.6662H12.0005C11.6469 10.6662 11.3078 10.8067 11.0578 11.0567C10.8077 11.3068 10.6673 11.646 10.6673 11.9996V15.9999M21.3329 26.6674V22.6671C21.3329 22.3135 21.1924 21.9743 20.9424 21.7242C20.6924 21.4742 20.3533 21.3337 19.9997 21.3337H17.3333C16.9797 21.3337 16.6406 21.4742 16.3906 21.7242C16.1405 21.9743 16.0001 22.3135 16.0001 22.6671V26.6674M26.6657 29.3343V2.66553M5.33447 15.9999H26.6657M5.33447 26.6674H26.6657M5.33447 2.66553V29.3343M5.33447 5.33241H26.6657"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScanIcon({ active: _active }: { active: boolean }) {
  // Updated to the simpler "Icon Box 2" variant from the latest Figma
  // export: bottle silhouette (three vertical rects + cap ellipse) sits
  // inside the four corner-bracket scan frame, no curved shoulder paths.
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-8 h-8"
      aria-hidden
    >
      <rect x="6.75293" y="8.33325" width="1.31818" height="18.6666" rx="0.659091" stroke="currentColor" strokeWidth="0.5" />
      <rect x="6.75293" y="8.33325" width="18.4545" height="18.6666" rx="0.66" stroke="currentColor" strokeWidth="0.5" />
      <rect x="23.8896" y="8.33325" width="1.31818" height="18.6666" rx="0.659091" stroke="currentColor" strokeWidth="0.5" />
      <ellipse cx="15.9801" cy="5.66666" rx="2.63636" ry="2.66666" stroke="currentColor" strokeWidth="0.5" />
      {/* Four corner brackets — filled so they tint with currentColor. */}
      <rect x="1" y="1" width="4.5" height="0.75" fill="currentColor" />
      <rect x="1" y="1" width="0.75" height="4.5" fill="currentColor" />
      <rect x="26.5" y="1" width="4.5" height="0.75" fill="currentColor" />
      <rect x="30.25" y="1" width="0.75" height="4.5" fill="currentColor" />
      <rect x="1" y="30.25" width="4.5" height="0.75" fill="currentColor" />
      <rect x="1" y="26" width="0.75" height="4.5" fill="currentColor" />
      <rect x="26.5" y="30.25" width="4.5" height="0.75" fill="currentColor" />
      <rect x="30.25" y="26" width="0.75" height="4.5" fill="currentColor" />
    </svg>
  );
}

function EncyclopediaIcon({ active: _active }: { active: boolean }) {
  // Updated to the "Encyclopedia 3" variant: two figures with
  // rectangular bodies + heads (right smaller, left larger), with a
  // central foreground rectangle and an overlapping accessory square
  // on the left figure. Cream fills preserved from the source so the
  // intentional layering reads against the cream nav background.
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-8 h-8"
      aria-hidden
    >
      <ellipse cx="23.425" cy="6.8499" rx="2.635" ry="2.7" stroke="currentColor" strokeWidth="0.5" />
      <path d="M17.4985 9.55005H29.3585V27.77H17.4985V9.55005Z" stroke="currentColor" strokeWidth="0.5" />
      <path d="M3.65723 8.19995H11.5672V27.77H3.65723V8.19995Z" stroke="currentColor" strokeWidth="0.5" />
      <rect x="5.62988" y="4.1499" width="3.95" height="4.05" stroke="currentColor" strokeWidth="0.5" />
      <rect x="6.95312" y="10.8999" width="18.4545" height="18.8999" rx="0.66" fill="#FAF6ED" stroke="currentColor" strokeWidth="0.5" />
      <ellipse cx="16.1801" cy="6.85004" rx="3.95455" ry="4.04999" fill="#FAF6ED" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}

function ProfileIcon({ active: _active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-8 h-8"
      aria-hidden
    >
      <path
        d="M16.0001 17.3333C19.6816 17.3333 22.6661 14.3486 22.6661 10.6667C22.6661 6.98477 19.6816 4 16.0001 4C12.3185 4 9.33407 6.98477 9.33407 10.6667C9.33407 14.3486 12.3185 17.3333 16.0001 17.3333ZM16.0001 17.3333C18.8288 17.3333 21.5416 18.4571 23.5418 20.4575C25.542 22.4579 26.6657 25.171 26.6657 28M16.0001 17.3333C13.1714 17.3333 10.4585 18.4571 8.45835 20.4575C6.45817 22.4579 5.33447 25.171 5.33447 28"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
