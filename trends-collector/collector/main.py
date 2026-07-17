"""
Entry point. Run weekly (cron). Produces data/fragrance-popularity-YYYY-Www.json.

    python -m collector.main --config config.yaml --out ./data

Each source is wrapped so one failure degrades the snapshot instead of killing
the run -- the failed source is simply absent from `sources_used`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import sys

import yaml

from . import __version__
from .normalize import blend, apply_week_over_week
from .feed_export import to_trending_feed, to_source_feeds
from .sources import GoogleTrends, RetailerBestsellers, Reddit, Fragrantica


def build_sources(cfg: dict):
    sources = []
    if cfg.get("google_trends", {}).get("enabled"):
        c = cfg["google_trends"]
        sources.append(GoogleTrends(watchlist=c["watchlist"], geo=c.get("geo", "US"),
                                    discover_rising=c.get("discover_rising", False)))
    if cfg.get("retailer_bestsellers", {}).get("enabled"):
        sources.append(RetailerBestsellers(endpoints=cfg["retailer_bestsellers"]["endpoints"]))
    if cfg.get("reddit", {}).get("enabled"):
        c = cfg["reddit"]
        sources.append(Reddit(
            client_id=os.environ.get("REDDIT_CLIENT_ID", c.get("client_id", "")),
            client_secret=os.environ.get("REDDIT_CLIENT_SECRET", c.get("client_secret", "")),
            user_agent=c.get("user_agent", "fragrance-trends/1.0"),
            watchlist=c["watchlist"], subreddit=c.get("subreddit", "fragrance"),
        ))
    if cfg.get("fragrantica", {}).get("enabled"):
        c = cfg["fragrantica"]
        sources.append(Fragrantica(
            trending_url=c["trending_url"], item_selector=c["item_selector"],
            name_selector=c["name_selector"], brand_selector=c.get("brand_selector"),
            link_selector=c.get("link_selector"), thumbnail_selector=c.get("thumbnail_selector"),
        ))
    return sources


def load_previous(out_dir: str, current_week: str | None = None):
    """Most recent snapshot from a PRIOR week.

    The collector runs daily now, so the newest file on disk is usually *this*
    week's (written by an earlier run today or yesterday). Comparing against it
    would turn rank_change into a day-over-day delta. Excluding the current
    week's file keeps rank_change genuinely week-over-week.
    """
    files = sorted(glob.glob(os.path.join(out_dir, "fragrance-popularity-*.json")))
    if current_week:
        skip = f"fragrance-popularity-{current_week}.json"
        files = [f for f in files if os.path.basename(f) != skip]
    if not files:
        return None
    with open(files[-1], encoding="utf-8") as fh:
        return json.load(fh)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--out", default="./data")
    ap.add_argument("--top", type=int, default=50, help="keep top N fragrances")
    args = ap.parse_args(argv)

    with open(args.config, encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)

    today = dt.date.today()
    iso = today.isocalendar()                     # (year, week, weekday)
    week_str = f"{iso[0]}-W{iso[1]:02d}"
    monday = today - dt.timedelta(days=today.weekday())

    all_signals, used = [], []
    for src in build_sources(cfg):
        try:
            sigs = src.collect()
            if sigs:
                all_signals.extend(sigs)
                used.append(src.key)
                print(f"[ok]   {src.key}: {len(sigs)} signals", file=sys.stderr)
            else:
                print(f"[warn] {src.key}: 0 signals", file=sys.stderr)
        except Exception as exc:                  # noqa: BLE001 -- degrade, don't die
            print(f"[fail] {src.key}: {exc}", file=sys.stderr)

    if not all_signals:
        print("No signals from any source -- not writing a snapshot.", file=sys.stderr)
        return 1

    previous = load_previous(args.out, week_str)
    fragrances = blend(all_signals)[: args.top]
    fragrances = apply_week_over_week(fragrances, previous)

    snapshot = {
        "schema_version": "1.0",
        "week": week_str,
        "week_start": monday.isoformat(),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "collector_version": __version__,
        "sources_used": used,
        "fragrances": fragrances,
    }

    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"fragrance-popularity-{week_str}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=2, ensure_ascii=False)
    # also write/overwrite a stable "latest" pointer for easy consumption
    with open(os.path.join(args.out, "latest.json"), "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=2, ensure_ascii=False)
    # app-facing TrendingFeed shape (consumed by the Spritz typed client)
    feed = to_trending_feed(snapshot, source=cfg.get("feed_source", "multi"))
    with open(os.path.join(args.out, "trending-weekly.json"), "w", encoding="utf-8") as fh:
        json.dump(feed, fh, indent=2, ensure_ascii=False)
    # one feed per source so the app can surface each area separately.
    # Skip empty ones: to_source_feeds emits a feed for EVERY known source,
    # including disabled/failed ones, and writing those would clobber a good
    # existing feed with 0 entries and make the section vanish from the app.
    # Leaving the file untouched keeps the last known-good data in place.
    for stem, sfeed in to_source_feeds(snapshot).items():
        if not sfeed["entries"]:
            print(f"[skip] {stem}: 0 entries, leaving existing feed untouched", file=sys.stderr)
            continue
        with open(os.path.join(args.out, f"{stem}.json"), "w", encoding="utf-8") as fh:
            json.dump(sfeed, fh, indent=2, ensure_ascii=False)
    print(f"Wrote {path} ({len(fragrances)} fragrances, sources: {', '.join(used)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
