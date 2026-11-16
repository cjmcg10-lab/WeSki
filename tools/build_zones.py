#!/usr/bin/env python3
"""Add zones to a built resort: terrain parks, kids' areas, sledding runs, race courses,
extreme and freeride terrain, night skiing.

It reads the same OpenStreetMap extract the resort was built from, plus the optional
"zones" block of the resort config (run names read off the resort's published trail map),
and rewrites public/data/<id>/resort.json in place. It does not need the elevation model,
so it can be re-run on any resort at any time.

usage: build_zones.py <tools/resorts/<id>.json> <extract.osm> <public/data/<id> dir>

Config (all optional):
  "zones": {"slow": [run names], "family": [...], "race": [...], "park": [runs that are terrain parks]}
  "slow_zone_trails": [run names]            (older spelling of zones.slow)
  "zones_source": "what the names were checked against"
"""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np
from shapely.geometry import LineString, Point, Polygon

cfg = json.load(open(sys.argv[1]))
osm_path, out = sys.argv[2], sys.argv[3]
R = json.load(open(f"{out}/resort.json"))
P, G = R["proj"], R["grid"]
W, H = (G["nx"] - 1) * G["cell"], (G["ny"] - 1) * G["cell"]


def loc(lon, lat):
    a, b = lon - P["lon0"], lat - P["lat0"]
    v = [1, a, b, a * a, a * b, b * b, a * a * a, a * a * b, a * b * b, b * b * b]
    return (sum(c * x for c, x in zip(P["cx"], v)), sum(c * x for c, x in zip(P["cy"], v)))


nodes, ways = {}, []
for _, el in ET.iterparse(osm_path):
    if el.tag == "node":
        nodes[el.get("id")] = (float(el.get("lon")), float(el.get("lat")))
        el.clear()
    elif el.tag == "way":
        t = {x.get("k"): x.get("v") for x in el.iter("tag")}
        if "piste:type" in t:
            ways.append((int(el.get("id")), [n.get("ref") for n in el.iter("nd")], t))
        el.clear()

RACE = re.compile(r"\b(race( ?course)?|racing|nastar|stade|rennstrecke|rennpiste|speed ?(check|strecke|ski)|"
                  r"chrono|kilom[eè]tre lanc[eé])\b", re.I)
NOT_RACE = re.compile(r"\b(woods|glades?|trees)\b", re.I)
is_race = lambda n: bool(n and RACE.search(n) and not NOT_RACE.search(n))
named = {"slow": set(cfg.get("slow_zone_trails", [])), "family": set(), "race": set(), "park": set()}
for k, v in cfg.get("zones", {}).items():
    assert k in named, f"zones: unknown kind {k!r}"
    named[k].update(v)
known = {T["name"] for T in R["trails"]}
for k, names in named.items():
    assert not names - known, f"zones.{k}: no run named {sorted(names - known)}"

tags = {wid: t for wid, _, t in ways}
# How ratings are shown: North America by symbol, Europe and Japan by piste colour (see src/rating.js).
tz = R.get("tz", "")
SCHEME = cfg.get("scheme") or ("eu" if tz.startswith("Europe/") else "jp" if tz.startswith("Asia/") else "us")
EU_CLASS = {"novice": 0, "easy": 1, "intermediate": 2, "advanced": 3, "expert": 4, "extreme": 4, "freeride": 4}
JP_CLASS = {"novice": 0, "easy": 0, "intermediate": 2, "advanced": 3, "expert": 3, "extreme": 3, "freeride": 4}
# Treeline (metres): above it the map shows open snow and rock instead of forest.
TREELINE = {"Europe/": 2200, "America/Denver": 3500, "America/Los_Angeles": 3000, "America/Boise": 2700, "America/New_York": 1300, "Asia/": 1500}
R["treeline"] = cfg.get("treeline") or next((v for k, v in TREELINE.items() if tz.startswith(k)), 1300)
R.pop("scheme", None)
if SCHEME != "us":
    R["scheme"] = SCHEME
# Runs with no rating in the map data. The build draws them blue; a better guess is the rating of
# the same run's other pieces, then of the runs it joins (for a short connector), then its slope.
rated = lambda T: bool(tags.get(T.get("osm"), {}).get("piste:difficulty"))
by_name, at_node = {}, {}
for T in R["trails"]:
    if rated(T) and T["name"]:
        by_name.setdefault(T["name"], []).append(T["d"])
for e in R["graph"]["edges"]:
    if e["k"] == "p" and rated(R["trails"][e["r"]]):
        for n in (e["a"], e["b"]):
            at_node.setdefault(n, []).append(R["trails"][e["r"]]["d"])
touch = {}
for e in R["graph"]["edges"]:
    if e["k"] == "p":
        touch.setdefault(e["r"], []).extend(at_node.get(e["a"], []) + at_node.get(e["b"], []))
for T in R["trails"]:
    if T.get("osm") in tags and not rated(T):
        grade = (T["top"] - T["bot"]) / max(T["len"], 1)
        slope = 0 if grade < 0.14 else 1 if grade < 0.28 else 2 if grade < 0.42 else 3
        same, near = by_name.get(T["name"]), touch.get(T["id"])
        T["d"] = max(set(same), key=same.count) if same else min(near) if near and T["len"] < 150 else slope

count = {}
for T in R["trails"]:
    t = tags.get(T.get("osm"), {})
    z = None
    for k in ("slow", "family", "race", "park"):
        if T["name"] in named[k]:
            z = k
    if not z and is_race(T["name"]):
        z = "race"
    if not z and t.get("piste:difficulty") == "extreme":
        z = "extreme"
    if not z and (t.get("piste:difficulty") == "freeride" or t.get("piste:grooming") == "backcountry"):
        z = "free"
    T.pop("c", None)
    T.pop("u", None)
    if T.get("osm") in tags and not t.get("piste:difficulty"):
        T["u"] = True           # no rating in the map data: the level shown is a guess
        count["unrated"] = count.get("unrated", 0) + 1
    if SCHEME != "us":
        T["c"] = (JP_CLASS if SCHEME == "jp" else EU_CLASS).get(t.get("piste:difficulty"), [1, 2, 3, 4][T["d"]])
    T.pop("z", None)
    T.pop("lit", None)
    if z:
        T["z"] = z
        count[z] = count.get(z, 0) + 1
    T["slow"] = z == "slow"
    if t.get("lit") == "yes" or t.get("piste:lit") == "yes":
        T["lit"] = True
        count["lit"] = count.get("lit", 0) + 1

# everything the resort already draws, to keep a neighbouring ski area's zones out
net = np.array([(T["pts"][i], T["pts"][i + 1]) for T in R["trails"] for i in range(0, len(T["pts"]), 6)]
               + [(L["pts"][i], L["pts"][i + 1]) for L in R["lifts"] for i in range(0, len(L["pts"]), 2)])


def near_resort(x, y, d=220):
    return float(np.min(np.hypot(net[:, 0] - x, net[:, 1] - y))) < d


def flat(pts):
    return [round(v, 1) for p in pts for v in p]


def fill(poly, step=12.0):
    """A closed area as a back-and-forth line across it, so it paints and hit-tests like a run."""
    x0, y0, x1, y1 = poly.bounds
    rows, y, flip = [], y0 + step / 2, False
    while y < y1:
        cut = poly.intersection(LineString([(x0 - 1, y), (x1 + 1, y)]))
        for g in getattr(cut, "geoms", [cut]):
            if g.geom_type == "LineString" and g.length > 0:
                n = max(1, int(g.length // step))
                row = [g.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]
                rows.append(row[::-1] if flip else row)
                flip = not flip
        y += step
    return [p for row in rows for p in row] or [poly.centroid.coords[0]] * 2


def dense(pts, step=12.0):
    o = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.dist(a, b) // step))
        o += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return o


KIND = {"snow_park": "park", "playground": "learn", "sled": "sled"}
DEFAULT = {"park": "Terrain park", "learn": "Kids' area", "sled": "Sledding run", "race": "Race course"}
parks = [p for p in R.get("parks", []) if p.get("note") != "OpenStreetMap"]
have = {p["name"] for p in parks}
zones = []
for wid, nd, t in ways:
    kind = KIND.get(t["piste:type"])
    if not kind or any(n not in nodes for n in nd) or len(nd) < 2:
        continue
    pts = [loc(*nodes[n]) for n in nd]
    if not all(0 <= x <= W and 0 <= y <= H for x, y in pts):
        continue
    name = t.get("name:en") or t.get("name") or t.get("piste:name")
    if is_race(name):
        kind = "race"
    closed = nd[0] == nd[-1] and len(nd) >= 4
    if closed:
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.area < 150:
            continue
        c = poly.representative_point()
        line = fill(poly)
    else:
        if LineString(pts).length < 25:
            continue
        c = LineString(pts).interpolate(0.5, normalized=True)
        line = dense(pts)
    if not near_resort(c.x, c.y):
        continue
    name = name or DEFAULT[kind]
    count[kind] = count.get(kind, 0) + 1
    if kind == "park":
        if name in have and name != DEFAULT[kind]:
            continue            # already placed by hand from the trail map
        parks.append({"name": name, "level": "Terrain park", "trail": -1, "note": "OpenStreetMap", "pts": flat(line)})
    else:
        zones.append({"kind": kind, "name": name, "pts": flat(line)})

R["parks"], R["zones"] = parks, zones
src = [cfg["zones_source"]] if cfg.get("zones_source") else []
if any(k not in ("unrated",) for k in count):
    src.append("OpenStreetMap piste tags")
R["sources"].pop("zones", None)
if src:
    R["sources"]["zones"] = "; ".join(src)
json.dump(R, open(f"{out}/resort.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(R["id"], count)
