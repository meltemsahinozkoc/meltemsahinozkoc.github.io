#!/usr/bin/env python3
"""
Process the cleaned Food & Coffee CSVs into the JSON the food-coffee-map
page consumes.

Usage:
    python scripts/process_takeout.py \
        --takeout .msahinoz/takeout/Takeout-Food_Coffee \
        --manifest scripts/takeout_lists.json \
        --out assets/data/food-coffee-map/places.json

Each list in the manifest specifies:
  - file      : CSV under <takeout>/Saved
  - city      : fixed city id (the place ALWAYS belongs to this city)
  - category  : one of 'food', 'coffee', 'food_coffee'
  - label     : chip label shown in the UI for the list within its city
  - top       : true for the Istanbul TOP list — flags places as featured top picks

For every place we:
  1. Geocode via Photon (komoot) ONLY for lat/lng + address. We do not use the
     resolved city — cities are fixed by the list.
  2. Pick a semantic type ('food' or 'coffee'). For 'food' / 'coffee' category
     lists, every entry is that type. For 'food_coffee' lists, we infer per
     place via Photon's osm_value and name keywords.
  3. Dedupe within a city (a place that appears in two lists for the same city
     keeps a single record; its `lists` array records every list it came from
     and `top` is OR-ed across lists). This preserves per-list counts: a list
     "size" is the number of places whose `lists` includes its label.

Resumable: results cache to scripts/.geocache.json and partials write to the
output JSON after every list completes.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


# ---- Type inference --------------------------------------------------------

OSM_COFFEE = {"cafe", "coffee_shop"}
OSM_FOOD = {
    "restaurant", "fast_food", "food_court", "deli", "bakery", "pastry",
    "ice_cream", "confectionery", "chocolate", "pastries", "bar", "pub",
    "biergarten", "wine", "winery",
}

COFFEE_KEYWORDS = [
    "coffee", "kahve", "café", "cafe", "espresso", "roaster", "roastery",
    "barista", "kahvecisi", "kahveci",
]


def infer_type(name: str, note: str, osm_value: str, category: str) -> str:
    """Return 'food' or 'coffee' for the place."""
    if category == "food":
        return "food"
    if category == "coffee":
        return "coffee"

    text = f"{name} {note}".lower()
    osm = (osm_value or "").lower()

    if osm in OSM_COFFEE:
        return "coffee"
    if any(kw in text for kw in COFFEE_KEYWORDS):
        return "coffee"
    if osm in OSM_FOOD:
        return "food"
    # Default fallback for ambiguous places in a mixed list.
    return "food"


# ---- URL parsing -----------------------------------------------------------

COORD_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")


def coords_from_url(url: str) -> Optional[tuple[float, float]]:
    if not url:
        return None
    m = COORD_RE.search(url)
    if m:
        return float(m.group(1)), float(m.group(2))
    m2 = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    if m2:
        return float(m2.group(1)), float(m2.group(2))
    return None


def place_id_from_url(url: str) -> str:
    m = re.search(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", url)
    return m.group(1) if m else ""


def title_from_url(url: str) -> str:
    m = re.search(r"/maps/place/([^/]+)/", url)
    if not m:
        return ""
    return urllib.parse.unquote_plus(m.group(1))


# ---- Geocoders -------------------------------------------------------------

PHOTON_URL = "https://photon.komoot.io/api/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = (
    "meltemsahinozkoc.github.io/food-coffee-map "
    "(personal site; github.com/meltemsahinozkoc)"
)


def _http_get_json(url: str, params: dict, timeout: float = 12.0) -> Optional[object]:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{url}?{qs}",
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def photon_lookup(name: str, hint: str) -> Optional[dict]:
    q = f"{name}, {hint}" if hint else name
    data = _http_get_json(PHOTON_URL, {"q": q, "limit": 1, "lang": "en"})
    if not data:
        return None
    features = data.get("features") if isinstance(data, dict) else None
    if not features:
        return None
    feat = features[0]
    coords = (feat.get("geometry") or {}).get("coordinates")
    if not (isinstance(coords, list) and len(coords) >= 2):
        return None
    props = feat.get("properties") or {}
    addr_bits = [
        props.get("name"),
        " ".join(b for b in [props.get("street"), props.get("housenumber")] if b),
        props.get("postcode"),
        props.get("city") or props.get("district") or props.get("locality"),
        props.get("state"),
        props.get("country"),
    ]
    return {
        "lat": float(coords[1]),
        "lng": float(coords[0]),
        "display": ", ".join(b for b in addr_bits if b),
        "osm_value": props.get("osm_value") or "",
        "osm_key": props.get("osm_key") or "",
    }


def nominatim_lookup(name: str, hint: str) -> Optional[dict]:
    q = f"{name}, {hint}" if hint else name
    data = _http_get_json(
        NOMINATIM_URL,
        {"q": q, "format": "json", "limit": 1, "addressdetails": 1},
    )
    time.sleep(1.05)
    if not data or not isinstance(data, list) or not data:
        return None
    r = data[0]
    return {
        "lat": float(r["lat"]),
        "lng": float(r["lon"]),
        "display": r.get("display_name", ""),
        "osm_value": r.get("type") or "",
        "osm_key": r.get("class") or "",
    }


def geocode(name: str, hint: str, cache: dict) -> Optional[dict]:
    key = f"{name}||{hint}".strip().lower()
    if key in cache:
        return cache[key]
    result = photon_lookup(name, hint)
    if not result:
        result = nominatim_lookup(name, hint)
    cache[key] = result
    return result


# ---- Misc ------------------------------------------------------------------

def slugify(text: str) -> str:
    s = text.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "place"


FEATURED_TOKENS = ("MUST-GO", "‼️", "best", "FAVORITE", "must go")


def is_featured(*texts: str) -> bool:
    blob = " ".join(t for t in texts if t)
    return any(tok.lower() in blob.lower() for tok in FEATURED_TOKENS)


def clean_note(note: str, tags: str, comment: str) -> str:
    parts: list[str] = []
    for src in (note, tags, comment):
        s = (src or "").strip()
        if not s:
            continue
        if re.fullmatch(r"[‼️\s]*MUST-GO[!\s]*", s):
            continue
        parts.append(s)
    seen, out = set(), []
    for p in parts:
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return " · ".join(out)


# ---- Data models -----------------------------------------------------------

@dataclass
class Place:
    id: str
    city: str
    name: str
    type: str            # 'food' | 'coffee'
    lists: list[str]     # source list labels (within this city)
    note: str = ""
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    maps_url: str = ""
    place_id: str = ""
    featured: bool = False
    top: bool = False    # member of a 'top picks' list
    geocoded: bool = False
    needs_review: bool = False


@dataclass
class City:
    id: str
    name: str
    country: str = ""
    center: dict = field(default_factory=dict)
    zoom: int = 13
    # List definitions in display order: [{ "label", "category", "top" }, ...]
    lists: list[dict] = field(default_factory=list)


# ---- CSV parsing -----------------------------------------------------------

def parse_csv(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        lines = f.readlines()
    header_idx = 0
    for i, line in enumerate(lines):
        if line.lstrip().startswith("Title,"):
            header_idx = i
            break
    reader = csv.DictReader(io.StringIO("".join(lines[header_idx:])))
    rows: list[dict] = []
    for r in reader:
        title = (r.get("Title") or "").strip()
        url = (r.get("URL") or "").strip()
        note = (r.get("Note") or "").strip()
        # Drop only completely empty rows (no title, no url at all).
        if not title and not url:
            continue
        if not title and url:
            title = title_from_url(url)
        # URLs like "/maps/place//data=..." have an empty slug. Fall back to
        # the note (it often holds the place name as a hint), then to the
        # short place_id hash so the row is still keyable.
        if not title:
            title = note
        if not title:
            pid = place_id_from_url(url)
            if pid:
                title = "Untitled · " + pid.split(":")[-1][-6:]
        if not title and not url:
            continue
        rows.append({
            "title": title or "Untitled",
            "note": note,
            "url": url,
            "tags": (r.get("Tags") or "").strip(),
            "comment": (r.get("Comment") or "").strip(),
        })
    return rows


# ---- Manifest --------------------------------------------------------------

def load_manifest(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"manifest not found: {path}")
    with path.open() as f:
        return json.load(f)


# ---- Main ------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--takeout", required=True, type=Path)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--cache", type=Path, default=Path("scripts/.geocache.json"))
    ap.add_argument("--no-geocode", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    manifest = load_manifest(args.manifest)
    saved_dir = args.takeout / "Saved"
    if not saved_dir.exists():
        sys.exit(f"no Saved/ folder under {args.takeout}")

    cache: dict = {}
    if args.cache.exists():
        try:
            cache = json.loads(args.cache.read_text())
        except Exception:
            cache = {}

    cities: dict[str, City] = {}
    for cid, cinfo in manifest.get("cities", {}).items():
        cities[cid] = City(
            id=cid,
            name=cinfo["name"],
            country=cinfo.get("country", ""),
            center=cinfo["center"],
            zoom=cinfo.get("zoom", 13),
        )

    list_specs = manifest.get("lists", [])
    if not list_specs:
        sys.exit("manifest has no 'lists' entries.")

    # Register every list under its city for UI chips. Multiple manifest specs
    # with the same label collapse into one chip — useful when several CSVs
    # split a single logical list (e.g. Izmir Food & Coffee 1 + 2).
    for spec in list_specs:
        cid = spec["city"]
        if cid not in cities:
            sys.exit(f"manifest list '{spec['file']}' references unknown city '{cid}'")
        label = spec.get("label") or Path(spec["file"]).stem
        if any(l["label"] == label for l in cities[cid].lists):
            continue
        cities[cid].lists.append({
            "label": label,
            "category": spec.get("category", "food_coffee"),
            "top": bool(spec.get("top", False)),
        })

    # All places — one per CSV row, no dedup. Counts must match raw row counts.
    places: list[Place] = []
    processed = 0

    # Per-list raw row counts (for verification)
    list_counts: dict[str, int] = {}

    def save_partial():
        out_data = {
            "schema_version": 2,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "google-takeout",
            "cities": cities_collection(),
            "places": [asdict(p) for p in places],
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(out_data, indent=2, ensure_ascii=False))

    def save_cache():
        args.cache.parent.mkdir(parents=True, exist_ok=True)
        args.cache.write_text(json.dumps(cache, indent=2, ensure_ascii=False))

    def cities_collection() -> list[dict]:
        active = {p.city for p in places}
        out: list[dict] = []
        for cid in sorted(cities.keys(), key=lambda x: cities[x].name):
            if cid not in active:
                continue
            out.append(asdict(cities[cid]))
        return out

    for spec in list_specs:
        list_file = saved_dir / spec["file"]
        city_id = spec["city"]
        category = spec.get("category", "food_coffee")
        list_label = spec.get("label") or Path(spec["file"]).stem
        is_top = bool(spec.get("top", False))
        hint = spec.get("region_hint", "")

        if not list_file.exists():
            print(f"[{cities[city_id].name} / {list_label}] SKIP — file missing: {list_file.name}")
            continue

        entries = parse_csv(list_file)
        key = f"{city_id}::{list_label}"
        list_counts[key] = list_counts.get(key, 0) + len(entries)
        print(f"[{cities[city_id].name} / {list_label}] {len(entries)} entries")
        contributed = 0

        for e in entries:
            if args.limit and processed >= args.limit:
                save_partial(); save_cache()
                print(f"\nhit --limit={args.limit}, stopping.")
                return 0

            name = e["title"]
            url = e["url"]
            pid_hash = place_id_from_url(url)

            featured = is_featured(e["note"], e["tags"], e["comment"])
            note_text = clean_note(e["note"], e["tags"], e["comment"])

            lat = lng = None
            address = ""
            geocoded = False
            osm_value = ""

            pulled = coords_from_url(url)
            if pulled:
                lat, lng = pulled

            if not args.no_geocode:
                got = geocode(name, hint, cache)
                if got:
                    if lat is None or lng is None:
                        lat = got["lat"]
                        lng = got["lng"]
                    address = got.get("display", "") or address
                    osm_value = got.get("osm_value", "") or osm_value
                    geocoded = True

            ptype = infer_type(name, note_text, osm_value, category)

            # ID is stable-ish: city + name slug + place_id_short + per-list index
            # (the index avoids collisions when the same row appears multiple
            # times in a CSV — we keep every row).
            pid = f"{city_id}-{slugify(name)}"
            if pid_hash:
                pid += "-" + pid_hash.split(":")[-1][-6:]
            pid += f"-{contributed:03d}"

            places.append(Place(
                id=pid,
                city=city_id,
                name=name,
                type=ptype,
                lists=[list_label],
                note=note_text,
                address=address,
                lat=lat,
                lng=lng,
                maps_url=url,
                place_id=pid_hash,
                featured=featured,
                top=is_top,
                geocoded=geocoded,
                needs_review=(lat is None),
            ))
            processed += 1
            contributed += 1

            if processed % 25 == 0:
                save_cache(); save_partial()

        save_cache(); save_partial()

    save_partial(); save_cache()

    n_review = sum(1 for p in places if p.needs_review)
    n_cities = len({p.city for p in places})
    print(f"\nwrote {len(places)} places across {n_cities} cities → {args.out}")
    if n_review:
        print(f"  {n_review} places need_review (no coords).")

    print("\nList counts (CSV rows → places with this list label):")
    seen_pairs: set[tuple[str, str]] = set()
    mismatches = 0
    for spec in list_specs:
        label = spec.get("label") or Path(spec["file"]).stem
        pair = (spec["city"], label)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        key = f"{spec['city']}::{label}"
        csv_rows = list_counts.get(key, 0)
        in_list = sum(1 for p in places if p.city == spec["city"] and label in p.lists)
        status = "OK" if in_list == csv_rows else "MISMATCH"
        if in_list != csv_rows:
            mismatches += 1
        print(f"  [{status}] {spec['city']:<16} / {label:<18} csv={csv_rows:<4} in_list={in_list}")
    if mismatches:
        print(f"\n{mismatches} list(s) have mismatched counts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
