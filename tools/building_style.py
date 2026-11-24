#!/usr/bin/env python3
"""Choose a look ("style") for each building on the 3D map from what OpenStreetMap says about it.

The app draws every building from its real footprint and height; the style only picks its skin and a few small
features (src/buildingstyle.js holds the looks). Styles:

  lodge    base lodge: glass front, timber upper floor, deck
  rest     mountain restaurant or summit hut: stone base, timber walls, balcony
  hut      alpine hut or chalet: dark timber, small shuttered windows, stone chimney
  hotel    hotel, condo or apartments: rendered walls, regular windows and balconies
  chapel   chapel or church: light walls, steep roof, small belfry
  tower    tower or clock tower: clock faces and a pyramid cap
  service  service building: metal cladding, roll-up door, few windows
  garage   parking garage: open floor bands

The same rules are written in src/buildingstyle.js (classifyBuilding) for maps built before the style was stored;
both read the name keywords from src/building_words.json and are checked against tests/fixtures/building_styles.json
(tools/test_building_style.py and tests/buildingstyle.test.js). Change both together.

usage: python3 tools/building_style.py --fixture tests/fixtures/building_styles.json   (prints mismatches)
"""
import json
import math
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS = json.load(open(os.path.join(ROOT, "src", "building_words.json"), encoding="utf-8"))
STYLES = ("lodge", "rest", "hut", "hotel", "chapel", "tower", "service", "garage")
BIG_LIFTS = ("chair", "gondola", "tram", "funicular")
NEAR_LIFT = 90     # m from a lift's end station
NEAR_PEAK = 150    # m from a named summit


def norm(name):
    """Lower case without accents (Hütte -> hutte)."""
    s = unicodedata.normalize("NFD", (name or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def tokens(s):
    return set(t for t in re.split(r"[^0-9a-zÀ-ɏ぀-ヿ一-鿿]+", s) if t)


def has(cat, name, toks):
    w = WORDS[cat]
    return any(x in toks for x in w["words"]) or any(p in name for p in w["parts"])


def classify(tags, area, h, levels=None, at_base=False, at_top=False):
    """One of STYLES. tags: the OpenStreetMap tags (building, amenity, tourism, man_made, shop, leisure, name);
    area in m², h the wall height in m, levels the storeys if known, at_base / at_top: beside a lift's bottom or top
    station (or a summit)."""
    name = norm(tags.get("name"))
    toks = tokens(name)
    T = WORDS["tags"]
    b, am, tu, mm = tags.get("building") or "", tags.get("amenity") or "", tags.get("tourism") or "", tags.get("man_made") or ""
    lv = levels or 0
    hit = lambda cat: has(cat, name, toks)
    if (h >= 8 and (b in T["tower"] or (mm == "tower" and area <= 150) or (hit("tower") and area <= 300 and not hit("hotel")))) \
            or (h >= 10 and area <= 150 and h >= 2.2 * math.sqrt(area)):
        return "tower"
    if b in T["chapel"] or am == "place_of_worship" or (hit("chapel") and not hit("hotel")):
        return "chapel"
    if b in T["parking"] or am == "parking" or hit("parking"):
        return "garage" if area >= 300 else "service"
    if b in T["garage"] or hit("garage"):
        return "garage" if area >= 600 else "service"
    if hit("lodge_strong"):
        return "lodge" if area >= 120 else "hut"
    if am in T["patrol_amenity"] or hit("patrol"):
        return "lodge" if area >= 200 else "hut"
    if tu in T["hotel_tourism"] or hit("hotel") or b in ("hotel", "apartments", "dormitory"):
        return "hotel"
    if am in T["food_amenity"] or hit("restaurant"):
        if area < 60:
            return "hut"
        return "lodge" if at_base and not at_top and area >= 400 else "rest"
    if tu in T["hut_tourism"] or am == "shelter" or hit("hut"):
        return "hut"
    if hit("lodge"):
        return "lodge" if area >= 150 else "hut"
    if hit("service") or am in T["service_amenity"] or b in T["service"] or mm:
        return "service"
    if b in T["hut"]:
        return "hotel" if lv >= 3 or area >= 600 else "hut"
    if b in T["hotel"]:
        return "hut" if area < 120 and lv < 3 else "hotel"
    if b in T["public"] or tags.get("shop") or tags.get("leisure"):
        if at_top and area >= 80:
            return "rest"
        return "lodge" if area >= 250 else "hut"
    if at_top:
        return "rest" if area >= 80 else "hut"
    if at_base and area >= 400:
        return "lodge"
    if area < 40:
        return "service"
    if lv >= 3 or h >= 12:
        return "hotel"
    if area >= 1500:
        return "service"
    return "hut" if area < 350 else "hotel"


def footprint(pts):
    """(area m², centre x, centre y) of a flat [x0, y0, x1, y1, ...] ring."""
    n = len(pts) // 2
    a = 0.0
    for i in range(n):
        x0, y0, x1, y1 = pts[2 * i], pts[2 * i + 1], pts[(2 * i + 2) % (2 * n)], pts[(2 * i + 3) % (2 * n)]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2, sum(pts[0::2]) / n, sum(pts[1::2]) / n


def context(cx, cy, lifts, pois):
    """(at_base, at_top) for a building centred at cx, cy, from resort.json lifts and POIs."""
    near = lambda x, y, r: (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    base = top = False
    for L in lifts:
        if L.get("kind") not in BIG_LIFTS:
            continue
        p = L["pts"]
        base = base or near(p[0], p[1], NEAR_LIFT)
        top = top or near(p[-2], p[-1], NEAR_LIFT)
    top = top or any(P.get("kind") == "peak" and near(P["x"], P["y"], NEAR_PEAK) for P in pois)
    return base, top


def style_of(b, tags, lifts, pois):
    """The style for one resort.json building (b) with its OpenStreetMap tags."""
    area, cx, cy = footprint(b["pts"])
    at_base, at_top = context(cx, cy, lifts, pois)
    return classify(tags, area, b["h"], b.get("levels"), at_base, at_top)


POI_KEYS = ("amenity", "tourism", "shop", "leisure")


def inside(x, y, pts):
    """Whether x, y lies inside the flat ring pts."""
    n, c = len(pts) // 2, False
    for i in range(n):
        x0, y0, x1, y1 = pts[2 * i], pts[2 * i + 1], pts[(2 * i + 2) % (2 * n)], pts[(2 * i + 3) % (2 * n)]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


def with_points(tags, pts, points):
    """The building's tags plus what OpenStreetMap points inside its footprint say (a restaurant or hotel is often
    mapped as a point inside an untagged building). points: [(x, y, tags)] in the map's local metres. The building's
    own tags win; its name comes from a point only when it has none."""
    out = dict(tags)
    for x, y, t in points:
        if not inside(x, y, pts):
            continue
        for k in POI_KEYS:
            if t.get(k) and not out.get(k):
                out[k] = t[k]
        if t.get("name") and not out.get("name"):
            out["name"] = t["name"]
    return out


def add_styles(buildings, tags, lifts, pois, points=()):
    """Set "st" on every resort.json building; tags[i] are building i's OpenStreetMap tags. Returns a count per style."""
    count = {}
    pts_list = list(points)
    for b, t in zip(buildings, tags):
        xs, ys = b["pts"][0::2], b["pts"][1::2]
        box = (min(xs), min(ys), max(xs), max(ys))
        near = [p for p in pts_list if box[0] <= p[0] <= box[2] and box[1] <= p[1] <= box[3]]
        b["st"] = style_of(b, with_points(t, b["pts"], near), lifts, pois)
        count[b["st"]] = count.get(b["st"], 0) + 1
    return count


def check_fixture(path):
    bad = 0
    cases = json.load(open(path, encoding="utf-8"))["cases"]
    for c in cases:
        i = c["in"]
        got = classify(i.get("tags", {}), i["area"], i["h"], i.get("levels"), i.get("atBase", False), i.get("atTop", False))
        if got != c["st"]:
            bad += 1
            print(f"mismatch: {c.get('why') or i} -> {got}, expected {c['st']}")
    print(f"{len(cases) - bad} of {len(cases)} cases match")
    return bad


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--fixture":
        sys.exit(1 if check_fixture(sys.argv[2]) else 0)
    raise SystemExit(__doc__)
