"use client";

// Own / Tried / Wishlist row for the fragrance detail page.
//
// The detail page is ISR-cached — one HTML render served to every visitor —
// so per-user save-state can't be baked in server-side anymore (it used to
// be, which forced the whole page dynamic). Instead this wrapper makes ONE
// authenticated fetch after hydration and passes each button its existing
// collection_items id.
//
// Signed-out and Clerk-loading states skip the fetch entirely; buttons
// render in their idle state, which is correct for those users.

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { SaveButton } from "@/components/save-button";
import type { CollectionStatus } from "@/lib/types";

export function SaveButtonsRow({ fragranceId }: { fragranceId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const [savedItemIds, setSavedItemIds] = useState<
    Partial<Record<CollectionStatus, string>>
  >({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/collection?fragranceId=${encodeURIComponent(fragranceId)}`,
        );
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as {
          items?: Array<{ id: string; status: CollectionStatus }>;
        } | null;
        if (cancelled || !body?.items) return;
        const ids: Partial<Record<CollectionStatus, string>> = {};
        for (const item of body.items) ids[item.status] = item.id;
        setSavedItemIds(ids);
      } catch {
        // Offline / network failure — buttons stay idle, which is safe.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, fragranceId]);

  // key remount once state arrives: SaveButton reads initialItemId only at
  // mount, and remounting is simpler + safer than syncing props into its
  // internal state machine mid-flight. fragranceId is in the key so a
  // client-side nav between two fragrance pages can never carry one
  // fragrance's saved state (or item ids) onto another's buttons.
  const keySuffix = `${fragranceId}-${hydrated ? "h" : "u"}`;

  return (
    <div className="grid grid-cols-3 col-span-2 gap-2">
      <SaveButton
        key={`own-${keySuffix}`}
        fragranceId={fragranceId}
        status="own"
        label="Own"
        initialItemId={savedItemIds.own ?? null}
      />
      <SaveButton
        key={`tried-${keySuffix}`}
        fragranceId={fragranceId}
        status="tried"
        label="Tried"
        initialItemId={savedItemIds.tried ?? null}
      />
      <SaveButton
        key={`wishlist-${keySuffix}`}
        fragranceId={fragranceId}
        status="wishlist"
        label="Wishlist"
        initialItemId={savedItemIds.wishlist ?? null}
      />
    </div>
  );
}
