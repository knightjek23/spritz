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
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#f2ede4]/95 backdrop-blur-md border-t border-white/20"
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
    </nav>
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
// Stroke-based inline SVGs. currentColor inherits the text color set on
// the wrapping span, so the active/inactive states need no extra props.

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2" : "1.6"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      <path d="M5 14L16 5l11 9v12a2 2 0 0 1-2 2h-6v-8h-6v8H7a2 2 0 0 1-2-2V14z" />
    </svg>
  );
}

function ShelfIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2" : "1.6"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      {/* Outer cabinet */}
      <rect x="5" y="4" width="22" height="24" rx="2" />
      {/* Two interior shelves */}
      <line x1="5" y1="13" x2="27" y2="13" />
      <line x1="5" y1="21" x2="27" y2="21" />
      {/* Bottles on each shelf — three columns */}
      <rect x="9" y="7" width="4" height="5" rx="0.5" />
      <rect x="15" y="7" width="3" height="5" rx="0.5" />
      <rect x="20" y="7" width="3" height="5" rx="0.5" />
      <rect x="9" y="15" width="3" height="5" rx="0.5" />
      <rect x="14" y="15" width="4" height="5" rx="0.5" />
    </svg>
  );
}

function ScanIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2.2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      {/* Four corner brackets — the scan bottle framing language */}
      <path d="M5 10V6a1 1 0 0 1 1-1h4" />
      <path d="M27 10V6a1 1 0 0 0-1-1h-4" />
      <path d="M5 22v4a1 1 0 0 0 1 1h4" />
      <path d="M27 22v4a1 1 0 0 1-1 1h-4" />
    </svg>
  );
}

function EncyclopediaIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2" : "1.6"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      {/* Open book — center spine, two facing pages */}
      <path d="M4 7c4 0 8 1.5 12 4 4-2.5 8-4 12-4v18c-4 0-8 1.5-12 4-4-2.5-8-4-12-4V7z" />
      <line x1="16" y1="11" x2="16" y2="29" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2" : "1.6"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-7 h-7"
      aria-hidden
    >
      <circle cx="16" cy="11" r="5" />
      <path d="M6 27c0-5.5 4.5-10 10-10s10 4.5 10 10" />
    </svg>
  );
}
