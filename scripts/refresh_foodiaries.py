#!/usr/bin/env python3
"""Fetch all @oncekahvem posts via Instagram Graph API, archive each image to
disk under images/foodiaries/<post_id>/, and write a JSON index pointing at
the *local* copies (PESOS — Publish Elsewhere, Syndicate to Own Site).

Reads from environment (or .env via --env-file):
  IG_USER_ID         Instagram Business Account id
  IG_ACCESS_TOKEN    long-lived user token

Writes:
  assets/data/foodiaries.json     index used by the gallery JS
  images/foodiaries/<id>/<i>.jpg  one file per image, served by Jekyll

The download step is idempotent: files already on disk are not re-fetched.
Posts that existed in a previous run but are no longer returned by the
Graph API (e.g. deleted from Instagram) are preserved in the JSON as long
as their archived media is still on disk.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

GRAPH = "https://graph.facebook.com/v21.0"
MEDIA_FIELDS = (
    "id,caption,media_url,thumbnail_url,permalink,timestamp,media_type,"
    "media_product_type,children{media_url,thumbnail_url,media_type}"
)

# Hashtag prefix the user uses to encode the city, e.g. #oncekahvembarcelona.
CITY_TAG_PREFIX = "oncekahvem"

# Allowlist of cities (lowercase, no spaces — match the tag suffix exactly).
# Each value is (display name, country, continent).
# To add a city: write its tag suffix on the left, the tuple on the right.
# Run `scripts/refresh_foodiaries.py` then check
# `assets/data/foodiaries-city-tags.txt` for new candidates.
KNOWN_CITIES: dict[str, tuple[str, str, str]] = {
    # Turkey
    "ankara":      ("Ankara",       "Turkey",        "Europe"),
    "odt":         ("Ankara",       "Turkey",        "Europe"),  # ODTÜ campus
    "odtu":        ("Ankara",       "Turkey",        "Europe"),  # ODTÜ campus
    "bilkent":     ("Ankara",       "Turkey",        "Europe"),
    "izmir":       ("İzmir",        "Turkey",        "Europe"),
    "istanbul":    ("Istanbul",     "Turkey",        "Europe"),
    "beykoz":      ("Istanbul",     "Turkey",        "Europe"),  # district
    "ayvalik":     ("Ayvalık",      "Turkey",        "Europe"),
    "ayval":       ("Ayvalık",      "Turkey",        "Europe"),  # historical typo
    "gelibolu":    ("Gelibolu",     "Turkey",        "Europe"),
    "bursa":       ("Bursa",        "Turkey",        "Europe"),
    "hatay":       ("Hatay",        "Turkey",        "Europe"),
    "adana":       ("Adana",        "Turkey",        "Europe"),
    "kayseri":     ("Kayseri",      "Turkey",        "Europe"),
    "nevsehir":    ("Nevşehir",     "Turkey",        "Europe"),
    "edirne":      ("Edirne",       "Turkey",        "Europe"),
    "akhisar":     ("Akhisar",      "Turkey",        "Europe"),
    # Europe (non-Turkey)
    "barcelona":   ("Barcelona",    "Spain",         "Europe"),
    "paris":       ("Paris",        "France",        "Europe"),
    "roma":        ("Rome",         "Italy",         "Europe"),
    "rome":        ("Rome",         "Italy",         "Europe"),
    # North America
    "boston":      ("Boston",       "United States", "North America"),
    "newyork":     ("New York",     "United States", "North America"),
    "nyc":         ("New York",     "United States", "North America"),
    "losangeles":  ("Los Angeles",  "United States", "North America"),
    "sandiego":    ("San Diego",    "United States", "North America"),
}

# Caption-text fallback for posts that don't carry a #oncekahvem<city> tag.
# (regex pattern, KNOWN_CITIES key) — first match wins, so put specific
# landmarks (ODTÜ, Bilkent) before bare city names. Patterns are matched
# case-insensitively with Unicode word boundaries.
CAPTION_KEYWORDS: list[tuple[str, str]] = [
    # Landmarks that imply a city
    (r"\bodt[üu]\b",       "ankara"),
    (r"\bbilkent\b",       "ankara"),
    (r"\bbeykoz\b",        "istanbul"),
    # Turkey
    (r"\bankara\b",        "ankara"),
    (r"\b[iİ]zmir\b",      "izmir"),
    (r"\b[iİ]stanbul\b",   "istanbul"),
    (r"\bbursa\b",         "bursa"),
    (r"\bhatay\b",         "hatay"),
    (r"\bkayseri\b",       "kayseri"),
    (r"\bnev[şs]ehir\b",   "nevsehir"),
    (r"\bedirne\b",        "edirne"),
    (r"\bakhisar\b",       "akhisar"),
    (r"\bro[mn]a\b",       "roma"),
    (r"\bayval[ıi]k\b",    "ayvalik"),
    (r"\bgelibolu\b",      "gelibolu"),
    # Outside Turkey
    (r"\bbarcelona\b",     "barcelona"),
    (r"\bparis\b",         "paris"),
    (r"\bboston\b",        "boston"),
    (r"\bnew york\b",      "newyork"),
    (r"\bnyc\b",           "nyc"),
    (r"\blos angeles\b",   "losangeles"),
    (r"\bsan diego\b",     "sandiego"),
]
# "Adana" deliberately NOT in CAPTION_KEYWORDS because "adana kebabı" the
# dish appears in posts from other cities. Use the #oncekahvemadana tag or
# a manual override for Adana posts.

CAPTION_KEYWORD_RES = [(re.compile(p, re.IGNORECASE | re.UNICODE), k) for p, k in CAPTION_KEYWORDS]

# 📍-pin pattern: the user often writes "📍<Place>, <CITY>" — a very strong
# location signal that we resolve before falling back to bare-word matching.
# Reverse-lookup table: lowercased display name -> KNOWN_CITIES key.
_DISPLAY_TO_KEY: dict[str, str] = {}
for _key, (_disp, _, _) in KNOWN_CITIES.items():
    _DISPLAY_TO_KEY.setdefault(_disp.lower(), _key)
# Also accept ASCII-folded variants (e.g. "izmir" -> "izmir", "ayvalik" -> "ayvalik").
import unicodedata
def _ascii_fold(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower()
for _key, (_disp, _, _) in KNOWN_CITIES.items():
    _DISPLAY_TO_KEY.setdefault(_ascii_fold(_disp), _key)

PIN_LOCATION_RE = re.compile(r"📍[^,\n]+,\s*([^\n•·\-—–]+?)(?:\s*$|\s*[\.\n•·\-—–])", re.UNICODE)


def extract_pin_city(caption: str) -> str | None:
    """Find a city named after a 📍...,  pattern."""
    if not caption:
        return None
    for raw in PIN_LOCATION_RE.findall(caption):
        candidate = _ascii_fold(raw.strip().rstrip(".,!?'\"")).strip()
        if candidate in _DISPLAY_TO_KEY:
            return _DISPLAY_TO_KEY[candidate]
        # Some pin lines list "City, Country" — try the first comma-separated token.
        first = candidate.split(",")[0].strip()
        if first in _DISPLAY_TO_KEY:
            return _DISPLAY_TO_KEY[first]
    return None

# Manual overrides loaded from this file (post id -> { city, tags, ... }).
OVERRIDES_PATH = Path("assets/data/foodiaries-overrides.json")

# Where archived images live on disk + the URL they're served at.
# Jekyll baseurl is empty (see _config.yml), so root-relative paths work.
MEDIA_DIR = Path("images/foodiaries")
MEDIA_URL_PREFIX = "/images/foodiaries"


def local_media_path(post_id: str, idx: int) -> Path:
    return MEDIA_DIR / post_id / f"{idx}.jpg"


def local_media_url(post_id: str, idx: int) -> str:
    return f"{MEDIA_URL_PREFIX}/{post_id}/{idx}.jpg"


def download_one(url: str, dest: Path, retries: int = 3) -> bool:
    """Download `url` to `dest`. Idempotent — returns True immediately if
    `dest` already exists with non-zero size. Returns False on failure
    after retries; partial files are removed."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 foodiaries-archiver"},
            )
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f)
            if dest.stat().st_size == 0:
                raise RuntimeError("empty body")
            return True
        except Exception as e:  # noqa: BLE001 — log all and retry
            last_err = e
            if dest.exists():
                dest.unlink()
            if attempt < retries - 1:
                time.sleep(1 + attempt * 2)
    print(f"  warn: download failed {dest} <- {url[:90]}…: {last_err}", file=sys.stderr)
    return False


def archive_media(records: list[dict[str, Any]], workers: int = 8) -> tuple[int, int]:
    """Download every CDN URL referenced in `records` and rewrite each
    record's `media_urls` (and `thumbnail_url`) to point at the local
    file. Records are mutated in place. Returns (downloaded, failed) —
    downloaded counts both newly-fetched and already-on-disk files."""
    jobs: list[tuple[dict[str, Any], int, str]] = []
    for rec in records:
        urls = rec.get("media_urls") or []
        for i, url in enumerate(urls):
            if isinstance(url, str) and url.startswith(MEDIA_URL_PREFIX):
                continue  # already local
            jobs.append((rec, i, url))
    if not jobs:
        return 0, 0

    print(f"  archiving {len(jobs)} media files (workers={workers})…", file=sys.stderr)

    def task(job: tuple[dict[str, Any], int, str]) -> tuple[dict[str, Any], int, bool]:
        rec, i, url = job
        ok = download_one(url, local_media_path(rec["id"], i))
        return rec, i, ok

    ok_count = 0
    fail_count = 0
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for rec, i, ok in pool.map(task, jobs):
            done += 1
            if ok:
                ok_count += 1
                rec["media_urls"][i] = local_media_url(rec["id"], i)
            else:
                fail_count += 1
            if done % 100 == 0:
                print(f"    {done}/{len(jobs)} processed", file=sys.stderr)

    # Refresh the convenience thumbnail field to match.
    for rec in records:
        urls = rec.get("media_urls") or []
        rec["thumbnail_url"] = urls[0] if urls else None

    return ok_count, fail_count


def merge_with_existing(new_records: list[dict[str, Any]], existing_path: Path) -> list[dict[str, Any]]:
    """Preserve previously archived posts that aren't in the new API
    response (e.g. deleted from Instagram). We only keep an old record
    if its media_urls all resolve to files still on disk — otherwise the
    archive is incomplete and the entry would render broken thumbnails."""
    if not existing_path.exists():
        return new_records
    try:
        old_records = json.loads(existing_path.read_text())
    except (json.JSONDecodeError, OSError):
        return new_records
    new_ids = {r["id"] for r in new_records}
    kept: list[dict[str, Any]] = []
    for rec in old_records:
        if rec.get("id") in new_ids:
            continue
        urls = rec.get("media_urls") or []
        if not urls:
            continue
        if all(
            isinstance(u, str)
            and u.startswith(MEDIA_URL_PREFIX)
            and (Path(".") / u.lstrip("/")).exists()
            for u in urls
        ):
            kept.append(rec)
    if kept:
        print(
            f"  preserved {len(kept)} archived posts no longer in the IG API response",
            file=sys.stderr,
        )
    return new_records + kept


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def fetch_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode())


def fetch_all_media(ig_user_id: str, token: str) -> list[dict[str, Any]]:
    qs = urllib.parse.urlencode(
        {"fields": MEDIA_FIELDS, "access_token": token, "limit": 100}
    )
    url = f"{GRAPH}/{ig_user_id}/media?{qs}"
    posts: list[dict[str, Any]] = []
    while url:
        page = fetch_json(url)
        if "error" in page:
            raise RuntimeError(f"Graph API error: {page['error']}")
        posts.extend(page.get("data", []))
        url = page.get("paging", {}).get("next")
    return posts


HASHTAG_RE = re.compile(r"#([A-Za-z0-9_]+)")


def extract_tags(caption: str) -> list[str]:
    return [t.lower() for t in HASHTAG_RE.findall(caption or "")]


def extract_location(tags: list[str], caption: str) -> tuple[str | None, str | None, str | None]:
    """Resolve a (city, country, continent) for a post.

    Strategy (first hit wins):
      1. #oncekahvem<city> tag matches KNOWN_CITIES.
      2. Caption text matches a CAPTION_KEYWORDS entry.
      3. Fall back to (None, None, None) — manual override only.

    Manual overrides (foodiaries-overrides.json) trump everything by
    being applied after this function in transform().
    """
    # 1) Tag-based lookup.
    for tag in tags:
        if not tag.startswith(CITY_TAG_PREFIX):
            continue
        suffix = tag[len(CITY_TAG_PREFIX):]
        if suffix in KNOWN_CITIES:
            return KNOWN_CITIES[suffix]

    # 2) 📍 pin pattern — strong, unambiguous location signal.
    pin_key = extract_pin_city(caption)
    if pin_key and pin_key in KNOWN_CITIES:
        return KNOWN_CITIES[pin_key]

    # 3) Caption-text fallback. When multiple cities are mentioned, pick
    # the one that appears earliest in the caption — that's more
    # predictable than the order of CAPTION_KEYWORDS.
    if caption:
        best_key = None
        best_pos = None
        for regex, key in CAPTION_KEYWORD_RES:
            if key not in KNOWN_CITIES:
                continue
            m = regex.search(caption)
            if m and (best_pos is None or m.start() < best_pos):
                best_pos = m.start()
                best_key = key
        if best_key:
            return KNOWN_CITIES[best_key]

    return None, None, None


def classify_season(month: int | None) -> str | None:
    """Northern-hemisphere seasons. None if month unknown."""
    if not month:
        return None
    if month in (3, 4, 5):
        return "Spring"
    if month in (6, 7, 8):
        return "Summer"
    if month in (9, 10, 11):
        return "Autumn"
    return "Winter"  # 12, 1, 2


# Caption keyword sets for the coffee/food/dessert split.
# A post can have multiple categories (e.g. "coffee + dessert").
# If neither coffee nor dessert words match, we fall back to "food".
_COFFEE_RE = re.compile(
    r"\b(kahve|kahvalt[ıi]|espresso|latte|cappucc?ino|americano|flat\s?white|"
    r"filter\s?coffee|filtre\s?kahve|cold\s?brew|v60|chemex|aeropress|barista|"
    r"pour[\s-]?over|t[üu]rk\s?kahve|mocha|macchiato|brew|brewing)\b",
    re.IGNORECASE | re.UNICODE,
)
_DESSERT_RE = re.compile(
    r"\b(tatl[ıi]|baklava|kek|waffle|dondurma|"
    r"ice\s?cream|gelato|tiramis[uù]|mousse|donut|doughnut|cookie|kurabiye|"
    r"lokum|muhallebi|s[üu]tla[çc]|halva|helva|cheesecake|brownie|"
    r"profiterol|kazand[ıi]b[ıi]|pa[şs]ta\b(?!\s*sosu)|krem|cr[èe]me|"
    r"sufle|s[uü]ffle|chocolate|[çc]ikolata|pancake|pancakes|crepe|cr[êe]pe)\b",
    re.IGNORECASE | re.UNICODE,
)


def classify_categories(caption: str, tags: list[str]) -> list[str]:
    """Return a list of categories for the post — any of {coffee, dessert, food}.

    A post can be tagged with multiple. "food" is the catch-all when neither
    coffee nor dessert keywords fire.
    """
    blob = (caption or "") + " " + " ".join(tags or [])
    cats: list[str] = []
    if _COFFEE_RE.search(blob):
        cats.append("coffee")
    if _DESSERT_RE.search(blob):
        cats.append("dessert")
    if not cats:
        cats.append("food")
    return cats


def short_caption(caption: str | None, limit: int = 2200) -> str:
    """Trim to Instagram's hard caption max (2200). Effectively no-op for almost
    all posts — but keeps the JSON from blowing up if a pathological caption
    ever comes through."""
    if not caption:
        return ""
    cap = caption.strip()
    if len(cap) <= limit:
        return cap
    return cap[: limit - 1].rstrip() + "…"


def collect_media_urls(post: dict[str, Any]) -> list[str]:
    """Return all viewable image URLs for a post, in display order.

    - IMAGE: [media_url]
    - VIDEO: [thumbnail_url] (browser would need a video element to play;
      the gallery just shows the still)
    - CAROUSEL_ALBUM: child media_urls (or thumbnail_url for VIDEO children)
    """
    media_type = post.get("media_type")
    urls: list[str] = []

    if media_type == "CAROUSEL_ALBUM":
        children = (post.get("children") or {}).get("data") or []
        for child in children:
            if child.get("media_type") == "VIDEO":
                u = child.get("thumbnail_url") or child.get("media_url")
            else:
                u = child.get("media_url") or child.get("thumbnail_url")
            if u:
                urls.append(u)
        if urls:
            return urls
        # Fall through to parent media_url if children are missing for some reason.

    if media_type == "VIDEO":
        u = post.get("thumbnail_url") or post.get("media_url")
        return [u] if u else []

    # IMAGE (or fallback for malformed carousels)
    u = post.get("media_url") or post.get("thumbnail_url")
    return [u] if u else []


def transform(post: dict[str, Any], overrides: dict[str, dict]) -> dict[str, Any]:
    caption = post.get("caption") or ""
    tags = extract_tags(caption)
    # Only keep #oncekahvem* tags, strip the prefix for display, drop the
    # ones we already show as the city, and drop very short fragments.
    known_city_suffixes = set(KNOWN_CITIES.keys())
    min_tag_len = 3
    visible_tags = sorted({
        t[len(CITY_TAG_PREFIX):]
        for t in tags
        if t.startswith(CITY_TAG_PREFIX)
        and len(t) - len(CITY_TAG_PREFIX) >= min_tag_len
        and t[len(CITY_TAG_PREFIX):] not in known_city_suffixes
    })
    timestamp = post.get("timestamp", "")
    year = int(timestamp[:4]) if timestamp[:4].isdigit() else None
    month = int(timestamp[5:7]) if len(timestamp) >= 7 and timestamp[5:7].isdigit() else None
    city, country, continent = extract_location(tags, caption)
    media_urls = collect_media_urls(post)
    record = {
        "id": post["id"],
        "permalink": post.get("permalink"),
        "timestamp": timestamp,
        "year": year,
        "month": month,
        "season": classify_season(month),
        "categories": classify_categories(caption, tags),
        "media_type": post.get("media_type"),
        "media_urls": media_urls,
        # Convenience: first URL is the cover.
        "thumbnail_url": media_urls[0] if media_urls else None,
        "caption": short_caption(caption),
        "tags": visible_tags,
        "city": city,
        "country": country,
        "continent": continent,
    }
    override = overrides.get(post["id"])
    if override:
        record.update({k: v for k, v in override.items() if v is not None})
    return record


def load_overrides() -> dict[str, dict]:
    if not OVERRIDES_PATH.exists():
        return {}
    return json.loads(OVERRIDES_PATH.read_text())


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env", type=Path)
    parser.add_argument(
        "--out", default=Path("assets/data/foodiaries.json"), type=Path
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Skip downloading media; write CDN URLs (which expire) into the JSON.",
    )
    parser.add_argument(
        "--workers", type=int, default=8, help="Concurrent download workers"
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    load_dotenv(args.env_file)

    ig_user_id = os.environ.get("IG_USER_ID")
    token = os.environ.get("IG_ACCESS_TOKEN")
    if not ig_user_id or not token:
        print("error: IG_USER_ID and IG_ACCESS_TOKEN must be set", file=sys.stderr)
        return 2

    print(f"fetching media for IG account {ig_user_id} ...", file=sys.stderr)
    raw_posts = fetch_all_media(ig_user_id, token)
    print(f"  fetched {len(raw_posts)} posts", file=sys.stderr)

    overrides = load_overrides()
    print(f"  loaded {len(overrides)} overrides", file=sys.stderr)

    records = [transform(p, overrides) for p in raw_posts]

    if not args.no_archive:
        ok, fail = archive_media(records, workers=args.workers)
        print(f"  archived {ok} files locally, {fail} failures", file=sys.stderr)
        records = merge_with_existing(records, args.out)

    records.sort(key=lambda r: r["timestamp"], reverse=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(records, indent=2, ensure_ascii=False))

    from collections import Counter
    city_counts = Counter(r["city"] for r in records if r["city"])
    country_counts = Counter(r["country"] for r in records if r["country"])
    continent_counts = Counter(r["continent"] for r in records if r["continent"])
    no_city = sum(1 for r in records if not r["city"])
    years = sorted({r["year"] for r in records if r["year"]})
    print(
        f"wrote {len(records)} posts to {args.out}\n"
        f"  posts with detected city: {len(records) - no_city} / {len(records)}\n"
        f"  cities ({len(city_counts)}): "
        + ", ".join(f"{c}({n})" for c, n in city_counts.most_common())
        + f"\n  countries ({len(country_counts)}): "
        + ", ".join(f"{c}({n})" for c, n in country_counts.most_common())
        + f"\n  continents ({len(continent_counts)}): "
        + ", ".join(f"{c}({n})" for c, n in continent_counts.most_common())
        + f"\n  years: {', '.join(map(str, years))}",
        file=sys.stderr,
    )

    # Also dump a city-tag-frequency report so the user can see all
    # #oncekahvem<x> tag suffixes and decide which are real cities.
    suffix_counts: Counter[str] = Counter()
    for p in raw_posts:
        for tag in extract_tags(p.get("caption") or ""):
            if tag.startswith(CITY_TAG_PREFIX):
                suffix = tag[len(CITY_TAG_PREFIX):]
                if suffix:
                    suffix_counts[suffix] += 1
    report = args.out.parent / "foodiaries-city-tags.txt"
    report.write_text(
        "# All #oncekahvem<suffix> tag occurrences (frequency desc).\n"
        "# Use this to spot real cities the auto-detector is missing.\n"
        + "\n".join(f"{n:>4}  {s}" for s, n in suffix_counts.most_common())
        + "\n"
    )
    print(f"  wrote tag-frequency report to {report}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
