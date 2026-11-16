#!/usr/bin/env python3
"""Audit a built resort against its sources and print what looks wrong.

It re-derives things independently of build_data.py and compares:
  * position: every trail and lift point is projected again from the OSM node coordinates
    and compared with the built geometry (catches projection or simplification drift)
  * elevation: runs must go downhill and lifts uphill on the terrain model; a run that climbs
    or a lift that ends below its base means the map and the terrain disagree there
  * rating: runs with no difficulty in the map data (the build has to guess), and the mix of
    ratings so it can be compared with the resort's published percentages
  * coverage: named runs and lifts in the map data that the build left out, loose ends,
    duplicates, very short stubs

usage: audit.py <tools/resorts/<id>.json> <extract.osm> <public/data/<id> dir> [--list]
"""
import json
import math
import sys
import xml.etree.ElementTree as ET
from collections import Counter

import numpy as np

cfg = json.load(open(sys.argv[1]))
RENAMED = cfg.get("rename", {})
osm_path, out = sys.argv[2], sys.argv[3]
LIST = "--list" in sys.argv
R = json.load(open(f"{out}/resort.json"))
P, G = R["proj"], R["grid"]
nx, ny, cell = G["nx"], G["ny"], G["cell"]
Hh = np.fromfile(f"{out}/terrain.bin", dtype="<u2").reshape(ny, nx) / 10.0 + G["zmin"]
W, H = (nx - 1) * cell, (ny - 1) * cell


def loc(lon, lat):
    a, b = lon - P["lon0"], lat - P["lat0"]
    v = [1, a, b, a * a, a * b, b * b, a * a * a, a * a * b, a * b * b, b * b * b]
    return (sum(c * x for c, x in zip(P["cx"], v)), sum(c * x for c, x in zip(P["cy"], v)))


def elev(x, y):
    fx, fy = min(max(x / cell, 0), nx - 1.001), min(max(y / cell, 0), ny - 1.001)
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    return float(Hh[j, i] * (1 - u) * (1 - v) + Hh[j, i + 1] * u * (1 - v) + Hh[j + 1, i] * (1 - u) * v + Hh[j + 1, i + 1] * u * v)


nodes, ways, boundary = {}, {}, None
for _, el in ET.iterparse(osm_path):
    if el.tag == "node":
        nodes[el.get("id")] = (float(el.get("lon")), float(el.get("lat")))
        el.clear()
    elif el.tag == "way":
        t = {x.get("k"): x.get("v") for x in el.iter("tag")}
        if t.get("landuse") == "winter_sports" and t.get("name") == cfg.get("area_name"):
            boundary = [n.get("ref") for n in el.iter("nd")]
        if "piste:type" in t or "aerialway" in t:
            ways[int(el.get("id"))] = ([n.get("ref") for n in el.iter("nd")], t)
        el.clear()


def dist_to_line(pts, x, y):
    best = 1e9
    for i in range(0, len(pts) - 3, 2):
        ax, ay, bx, by = pts[i:i + 4]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) if l2 else 0
        best = min(best, math.hypot(x - ax - dx * t, y - ay - dy * t))
    return best


issues = Counter()
detail = []


def flag(kind, text):
    issues[kind] += 1
    detail.append(f"  [{kind}] {text}")


# --- position: built geometry against a fresh projection of the OSM nodes
drift = []
for T in R["trails"]:
    w = ways.get(T.get("osm"))
    if not w:
        continue
    if w[0][0] == w[0][-1]:
        p = T["pts"]
        if math.hypot(p[0] - p[-2], p[1] - p[-1]) < 2:
            flag("loop", f"{T['name'] or 'unnamed'} (way {T['osm']}): an outlined area drawn as a run round its edge")
        continue            # outlined areas are drawn down the middle, not along the mapped outline
    for n in w[0]:
        if n in nodes:
            drift.append(dist_to_line(T["pts"], *loc(*nodes[n])))
for L in R["lifts"]:
    w = ways.get(L.get("osm")) if isinstance(L.get("osm"), int) else None
    if w:
        for n in (w[0][0], w[0][-1]):
            if n in nodes:
                drift.append(dist_to_line(L["pts"], *loc(*nodes[n])))
drift = np.array(drift) if drift else np.zeros(1)

# --- elevation: runs downhill, lifts uphill
unrated = 0
mix = Counter()
for T in R["trails"]:
    pts = T["pts"]
    zs = [elev(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)]
    name = T["name"] or f"unnamed (way {T.get('osm')})"
    # the longest climb inside a run, measured from the lowest point so far
    low, climb = zs[0], 0.0
    for z in zs:
        low = min(low, z)
        climb = max(climb, z - low)
    if climb > 12 and T["len"] > 60:
        flag("run climbs", f"{name}: rises {climb:.0f} m partway down ({T['len']} m long)")
    if zs[-1] > zs[0] + 3:
        flag("run uphill", f"{name}: ends {zs[-1] - zs[0]:.0f} m above its start")
    if T["len"] < 25 and T["name"]:
        flag("stub", f"{name}: only {T['len']} m long")
    w = ways.get(T.get("osm"))
    d = w[1].get("piste:difficulty") if w else "?"
    if w and not d:
        unrated += T["len"]
        flag("no rating", f"{name}: no difficulty in the map data, drawn as {['green', 'blue', 'black', 'double black'][T['d']]}")
    mix[T["d"]] += T["len"]
    # how steep is it for its rating?
    drop = zs[0] - zs[-1]
    if T["len"] > 250 and T["d"] == 0 and drop / T["len"] > 0.32:
        flag("steep green", f"{name}: easiest rating but averages {100 * drop / T['len']:.0f}% grade")
    if T["len"] > 250 and T["d"] >= 2 and 0 <= drop / T["len"] < 0.10 and not T.get("glade"):
        flag("flat black", f"{name}: expert rating but averages {100 * drop / T['len']:.0f}% grade")
for L in R["lifts"]:
    a, b = elev(L["pts"][0], L["pts"][1]), elev(L["pts"][-2], L["pts"][-1])
    if b < a - 3 and not L.get("both"):
        flag("lift downhill", f"{L['name']}: top is {a - b:.0f} m below its base")

# --- coverage: named things in the map data the build left out
inside_resort = None
if boundary and all(n in nodes for n in boundary):
    from shapely.geometry import Point, Polygon
    _poly = Polygon([nodes[n] for n in boundary]).buffer(0.0015)
    inside_resort = lambda lon, lat: _poly.contains(Point(lon, lat))
built_t = {T.get("osm") for T in R["trails"]}
built_names = {T["name"] for T in R["trails"]} | {a["name"] for a in R.get("areas", [])}
built_l = {L["name"] for L in R["lifts"]}
net = np.array([(T["pts"][i], T["pts"][i + 1]) for T in R["trails"] for i in range(0, len(T["pts"]), 8)])
for wid, (nd, t) in ways.items():
    if any(n not in nodes for n in nd) or len(nd) < 2:
        continue
    pts = [loc(*nodes[n]) for n in nd]
    if not all(0 <= x <= W and 0 <= y <= H for x, y in pts):
        continue
    if inside_resort and sum(inside_resort(*nodes[n]) for n in nd) < 0.5 * len(nd):
        continue            # belongs to a neighbour (or a private run outside the resort boundary)
    mx, my = pts[len(pts) // 2]
    near = float(np.min(np.hypot(net[:, 0] - mx, net[:, 1] - my)))
    name = t.get("name:en") or t.get("name") or t.get("piste:name")
    if t.get("piste:type") == "downhill" and wid not in built_t and name and name not in built_names and near < 150 and t.get("area") != "yes":
        flag("run missing", f"{name} (way {wid}) is in the map data but not on the built map")
    if t.get("aerialway") in ("chair_lift", "gondola", "cable_car", "mixed_lift", "drag_lift", "t-bar", "platter", "magic_carpet", "rope_tow", "j-bar") \
            and name and name not in built_l and RENAMED.get(name, name) not in built_l and near < 250:
        flag("lift missing", f"{name} (way {wid}, {t['aerialway']}) is in the map data but not on the built map")

# --- duplicates: two runs lying on top of each other
segs = [(T, np.array(T["pts"]).reshape(-1, 2)) for T in R["trails"] if T["len"] > 80]
seen = set()
grid = {}
for k, (T, a) in enumerate(segs):
    for x, y in a[::3]:
        grid.setdefault((int(x // 20), int(y // 20)), set()).add(k)
for k, (T, a) in enumerate(segs):
    hits = Counter()
    for x, y in a[::3]:
        for o in grid.get((int(x // 20), int(y // 20)), ()):
            if o != k:
                hits[o] += 1
    for o, n in hits.items():
        if n >= 0.8 * len(a[::3]) and (o, k) not in seen and segs[o][0]["name"] != T["name"]:
            seen.add((k, o))
            flag("overlap", f"{T['name'] or 'unnamed'} runs on top of {segs[o][0]['name'] or 'unnamed'}")

# --- loose ends: a run whose bottom leads nowhere
out_edges = Counter(e["a"] for e in R["graph"]["edges"])
for e in R["graph"]["edges"]:
    if e.get("bi"):
        out_edges[e["b"]] += 1
ends = {}
for e in R["graph"]["edges"]:
    if e["k"] == "p":
        ends[e["r"]] = e["b"] if e["r"] not in ends or R["graph"]["nodes"][e["b"]][2] < R["graph"]["nodes"][ends[e["r"]]][2] else ends[e["r"]]
for r, n in ends.items():
    T = R["trails"][r]
    if out_edges[n] == 0 and T["len"] > 120:
        flag("dead end", f"{T['name'] or 'unnamed'}: the bottom connects to nothing")

tot = sum(mix.values()) or 1
print(f"{R['id']}: {len(R['trails'])} run pieces, {len(R['lifts'])} lifts, grid {cell:g} m | "
      f"position drift median {np.median(drift):.2f} m, worst {drift.max():.1f} m | "
      f"rating mix by length green {100 * mix[0] / tot:.0f}% blue {100 * mix[1] / tot:.0f}% black {100 * mix[2] / tot:.0f}% double {100 * mix[3] / tot:.0f}% | "
      f"unrated {100 * unrated / tot:.0f}%")
print("  " + (", ".join(f"{k}: {n}" for k, n in sorted(issues.items())) or "nothing flagged"))
if LIST:
    print("\n".join(sorted(detail)))
