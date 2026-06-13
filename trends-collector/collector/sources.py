"""
Source modules. One class per signal source.

Every source returns a list of RawSignal objects. A source is allowed to fail
(network down, site changed its HTML, rate limited) WITHOUT killing the run:
main.py catches exceptions per-source and just records that source as missing.

Each source produces a raw, source-local number. normalize.py turns those into a
comparable 0-100 score. Sources may also attach optional `url` and `thumbnail`
(used downstream for catalog joins): Fragrantica gives a fragrantica_url, which
is the cleanest join key for a Fragrantica-scraped catalog.

NOTE: these run against the live web, so they need real network access and,
for Reddit, API credentials. They will NOT run inside a no-network sandbox.
"""
from __future__ import annotations

import dataclasses
import re
from typing import Optional


def slugify(brand: Optional[str], name: str) -> str:
    raw = f"{brand or ''} {name}".strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    return raw.strip("-")


@dataclasses.dataclass
class RawSignal:
    name: str
    brand: Optional[str]
    value: float            # raw, source-local magnitude (higher = more popular)
    source: str
    url: Optional[str] = None        # canonical link (e.g. fragrantica_url)
    thumbnail: Optional[str] = None  # image url, if the source exposes one

    @property
    def id(self) -> str:
        return slugify(self.brand, self.name)


class Source:
    key: str = "base"

    def collect(self) -> list[RawSignal]:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# 1. Google Trends                                                            #
# --------------------------------------------------------------------------- #
class GoogleTrends(Source):
    key = "google_trends"

    def __init__(self, watchlist: list[dict], geo: str = "US"):
        self.watchlist = watchlist
        self.geo = geo

    def collect(self) -> list[RawSignal]:
        from pytrends.request import TrendReq  # pip install pytrends
        pytrends = TrendReq(hl="en-US", tz=0)
        out: list[RawSignal] = []
        batches = [self.watchlist[i:i + 5] for i in range(0, len(self.watchlist), 5)]
        for batch in batches:
            kw = [item["query"] for item in batch]
            pytrends.build_payload(kw, timeframe="now 7-d", geo=self.geo)
            df = pytrends.interest_over_time()
            if df.empty:
                continue
            for item in batch:
                q = item["query"]
                if q in df.columns:
                    out.append(RawSignal(
                        name=item["name"], brand=item.get("brand"),
                        value=float(df[q].mean()), source=self.key,
                    ))
        return out


# --------------------------------------------------------------------------- #
# 2. Retailer bestsellers                                                     #
# --------------------------------------------------------------------------- #
class RetailerBestsellers(Source):
    key = "retailer_bestsellers"

    def __init__(self, endpoints: list[dict]):
        self.endpoints = endpoints

    def collect(self) -> list[RawSignal]:
        import requests
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (compatible; FragranceTrends/1.0)"}
        best: dict[str, tuple] = {}
        for ep in self.endpoints:
            resp = requests.get(ep["url"], headers=headers, timeout=20)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            for pos, node in enumerate(soup.select(ep["item_selector"]), start=1):
                name_node = node.select_one(ep["name_selector"])
                if not name_node:
                    continue
                name = name_node.get_text(strip=True)
                brand = None
                if ep.get("brand_selector") and node.select_one(ep["brand_selector"]):
                    brand = node.select_one(ep["brand_selector"]).get_text(strip=True)
                thumb = None
                if ep.get("thumbnail_selector") and node.select_one(ep["thumbnail_selector"]):
                    thumb = node.select_one(ep["thumbnail_selector"]).get("src")
                sid = slugify(brand, name)
                if sid not in best or pos < best[sid][2]:
                    best[sid] = (name, brand, pos, thumb)
        out = []
        for name, brand, pos, thumb in best.values():
            out.append(RawSignal(name=name, brand=brand, value=float(1000.0 / pos),
                                 source=self.key, thumbnail=thumb))
        return out


# --------------------------------------------------------------------------- #
# 3. Reddit r/fragrance                                                       #
# --------------------------------------------------------------------------- #
class Reddit(Source):
    key = "reddit"

    def __init__(self, client_id: str, client_secret: str, user_agent: str,
                 watchlist: list[dict], subreddit: str = "fragrance"):
        self.client_id = client_id
        self.client_secret = client_secret
        self.user_agent = user_agent
        self.watchlist = watchlist
        self.subreddit = subreddit

    def collect(self) -> list[RawSignal]:
        import praw  # pip install praw
        reddit = praw.Reddit(client_id=self.client_id,
                             client_secret=self.client_secret,
                             user_agent=self.user_agent)
        posts = list(reddit.subreddit(self.subreddit).top(time_filter="week", limit=400))
        out = []
        for item in self.watchlist:
            aliases = [a.lower() for a in item.get("aliases", [item["name"]])]
            weight = 0.0
            for p in posts:
                blob = f"{p.title} {getattr(p, 'selftext', '')}".lower()
                if any(a in blob for a in aliases):
                    weight += (p.score + p.num_comments)
            if weight > 0:
                out.append(RawSignal(name=item["name"], brand=item.get("brand"),
                                     value=weight, source=self.key))
        return out


# --------------------------------------------------------------------------- #
# 4. Fragrantica (best-effort; supplies the clean fragrantica_url join key)    #
# --------------------------------------------------------------------------- #
class Fragrantica(Source):
    key = "fragrantica"

    def __init__(self, trending_url: str, item_selector: str, name_selector: str,
                 brand_selector: Optional[str] = None,
                 link_selector: Optional[str] = None,
                 thumbnail_selector: Optional[str] = None):
        self.trending_url = trending_url
        self.item_selector = item_selector
        self.name_selector = name_selector
        self.brand_selector = brand_selector
        self.link_selector = link_selector
        self.thumbnail_selector = thumbnail_selector

    def collect(self) -> list[RawSignal]:
        import requests
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (compatible; FragranceTrends/1.0)"}
        resp = requests.get(self.trending_url, headers=headers, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        out = []
        for pos, node in enumerate(soup.select(self.item_selector), start=1):
            name_node = node.select_one(self.name_selector)
            if not name_node:
                continue
            name = name_node.get_text(strip=True)
            brand = None
            if self.brand_selector and node.select_one(self.brand_selector):
                brand = node.select_one(self.brand_selector).get_text(strip=True)
            url = None
            link = node.select_one(self.link_selector) if self.link_selector else node.select_one("a")
            if link and link.get("href"):
                href = link["href"]
                url = href if href.startswith("http") else f"https://www.fragrantica.com{href}"
            thumb = None
            if self.thumbnail_selector and node.select_one(self.thumbnail_selector):
                thumb = node.select_one(self.thumbnail_selector).get("src")
            out.append(RawSignal(name=name, brand=brand, value=float(1000.0 / pos),
                                 source=self.key, url=url, thumbnail=thumb))
        return out
