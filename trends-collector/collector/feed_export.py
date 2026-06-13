"""
Adapter: internal weekly snapshot  ->  the app-facing TrendingFeed shape(s).

Two outputs:
  - to_trending_feed(snapshot)  -> a single blended feed (source="multi")
  - to_source_feeds(snapshot)   -> one feed per source, ranked WITHIN that source,
                                   so the app can surface each area separately.

TrendingFeed = {
  schema_version, generated_at, period:{start,end}, source,
  entries: [{ rank, name, house, fragrantica_url?, external_id?,
              mentions?, thumbnail_url?, source_url? }]
}
"""
from __future__ import annotations

import datetime as dt

TRENDING_FEED_SCHEMA_VERSION = "1.0"

# source key -> (output filename stem, higher_signal_is_more_popular)
# retailer signal is a position (best rank, lower = better), so it sorts ascending.
SOURCE_AREAS = {
    "google_trends": ("trending-google", True),
    "retailer_bestsellers": ("trending-retailer", False),
    "reddit": ("trending-reddit", True),
    "fragrantica": ("trending-fragrantica", True),
}


def _period(snapshot: dict):
    start = snapshot.get("week_start")
    try:
        end = (dt.date.fromisoformat(start) + dt.timedelta(days=6)).isoformat()
    except Exception:
        end = start
    return start, end


def _entry(f: dict, rank: int, mentions_from: str | None = None) -> dict:
    entry = {"rank": rank, "name": f["name"], "house": f.get("brand") or ""}
    if f.get("fragrantica_url"):
        entry["fragrantica_url"] = f["fragrantica_url"]
    if f.get("thumbnail_url"):
        entry["thumbnail_url"] = f["thumbnail_url"]
    if mentions_from is not None:
        v = f.get("signals", {}).get(mentions_from)
        if v is not None:
            entry["mentions"] = int(round(v))
    return entry


def to_trending_feed(snapshot: dict, source: str = "multi") -> dict:
    start, end = _period(snapshot)
    entries = [_entry(f, f["rank"], mentions_from="reddit") for f in snapshot["fragrances"]]
    return {
        "schema_version": TRENDING_FEED_SCHEMA_VERSION,
        "generated_at": snapshot["generated_at"],
        "period": {"start": start, "end": end},
        "source": source,
        "entries": entries,
    }


def to_source_feeds(snapshot: dict) -> dict[str, dict]:
    """One TrendingFeed per source, keyed by output filename stem."""
    start, end = _period(snapshot)
    feeds: dict[str, dict] = {}
    for src, (stem, higher_better) in SOURCE_AREAS.items():
        rows = [f for f in snapshot["fragrances"]
                if f.get("signals", {}).get(src) is not None]
        rows.sort(key=lambda f: f["signals"][src], reverse=higher_better)
        entries = [
            _entry(f, i, mentions_from=("reddit" if src == "reddit" else None))
            for i, f in enumerate(rows, start=1)
        ]
        feeds[stem] = {
            "schema_version": TRENDING_FEED_SCHEMA_VERSION,
            "generated_at": snapshot["generated_at"],
            "period": {"start": start, "end": end},
            "source": src,
            "entries": entries,
        }
    return feeds
