"""
Turn per-source raw signals into one ranked, 0-100 scored list, compute
week-over-week rank changes, and carry through optional enrichment (fragrantica
URL + thumbnail) so the downstream feed can join cleanly to a catalog.

Coverage damping rewards corroboration: a fragrance seen across many sources
keeps its score, while one seen in a single source is gently discounted (sqrt of
weight-coverage) so a lone loud signal cannot top the chart on its own.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

from .sources import RawSignal, slugify

DEFAULT_WEIGHTS = {
    "google_trends": 0.30,
    "retailer_bestsellers": 0.35,
    "reddit": 0.20,
    "fragrantica": 0.15,
}


def _minmax(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    lo, hi = min(values.values()), max(values.values())
    if hi == lo:
        return {k: 100.0 for k in values}
    return {k: (v - lo) / (hi - lo) * 100.0 for k, v in values.items()}


def blend(signals: list[RawSignal], weights: dict[str, float] = None) -> list[dict]:
    weights = weights or DEFAULT_WEIGHTS

    by_source: dict[str, dict[str, float]] = defaultdict(dict)
    meta: dict[str, dict] = {}
    for s in signals:
        by_source[s.source][s.id] = s.value
        m = meta.setdefault(s.id, {"name": s.name, "brand": s.brand,
                                   "url": None, "thumbnail": None})
        if getattr(s, "url", None) and not m["url"]:
            m["url"] = s.url
        if getattr(s, "thumbnail", None) and not m["thumbnail"]:
            m["thumbnail"] = s.thumbnail

    normed = {src: _minmax(vals) for src, vals in by_source.items()}

    total_w = sum(weights.values()) or 1.0
    fragrances = []
    for sid, info in meta.items():
        present = {src: normed[src][sid] for src in normed if sid in normed[src]}
        if not present:
            continue
        wsum = sum(weights.get(src, 0) for src in present)
        if wsum == 0:
            base = sum(present.values()) / len(present)
            wsum = total_w
        else:
            base = sum(present[src] * weights.get(src, 0) for src in present) / wsum
        coverage = (wsum / total_w) ** 0.5
        score = base * coverage
        fragrances.append({
            "id": sid,
            "name": info["name"],
            "brand": info["brand"],
            "score": round(score, 1),
            "fragrantica_url": info["url"],
            "thumbnail_url": info["thumbnail"],
            "signals": {
                "google_trends": round(by_source["google_trends"].get(sid), 1) if sid in by_source.get("google_trends", {}) else None,
                "retailer_bestsellers": _best_rank(by_source.get("retailer_bestsellers", {}), sid),
                "reddit": round(by_source["reddit"].get(sid), 1) if sid in by_source.get("reddit", {}) else None,
                "fragrantica": round(by_source["fragrantica"].get(sid), 1) if sid in by_source.get("fragrantica", {}) else None,
            },
        })

    fragrances.sort(key=lambda f: f["score"], reverse=True)
    for i, f in enumerate(fragrances, start=1):
        f["rank"] = i
    return fragrances


def _best_rank(retailer_vals: dict[str, float], sid: str):
    if sid not in retailer_vals:
        return None
    return int(round(1000.0 / retailer_vals[sid]))


def apply_week_over_week(current: list[dict], previous: Optional[dict]) -> list[dict]:
    prev_rank = {}
    if previous:
        prev_rank = {f["id"]: f["rank"] for f in previous.get("fragrances", [])}
    for f in current:
        if f["id"] in prev_rank:
            f["rank_change"] = prev_rank[f["id"]] - f["rank"]
            f["is_new_entry"] = False
        else:
            f["rank_change"] = None
            f["is_new_entry"] = True
    return current
