// Top Scents for Men / Women. Server components over the shared scroller.
// Lists rotate every 3 days (lib/discovery/lists), so the order is a
// window's ranking, not a standing chart: no "#n" chips. Each self-hides
// when its list is empty.

import { FragranceScroller } from "./fragrance-scroller";
import { getTopScents } from "@/lib/discovery/lists";

type Variant = "default" | "compact";

export async function TopScentsForMen({ variant = "default" }: { variant?: Variant }) {
  const rows = await getTopScents("men");
  return <FragranceScroller title="Top scents for men" rows={rows} variant={variant} showRank={false} />;
}

export async function TopScentsForWomen({ variant = "default" }: { variant?: Variant }) {
  const rows = await getTopScents("women");
  return <FragranceScroller title="Top scents for women" rows={rows} variant={variant} showRank={false} />;
}
