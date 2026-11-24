#!/usr/bin/env python3
"""Start-screen globe data (Natural Earth via the world-atlas / us-atlas packages, public domain).

  globe.bin   Int16 pairs (lon*180, lat*180), all point lists back to back
  globe.json  how many points each list has, per layer:
                land    filled land outlines, 1:50m (whole world)
                coast   coastlines to draw as crisp lines, 1:50m, outside the detailed regions
                borders country borders, 1:50m, outside the detailed regions
                states  US state borders
                hi      1:10m coastlines + borders inside boxes around the resorts that have maps
                water   inland seas (holes in the land outlines), painted as water

usage: build_globe.py <public/data dir>
"""
import json
import os
import sys
import urllib.request

out = sys.argv[1]
SCALE = 180


def get(name):
    # GLOBE_NPM_DIR: folder holding the unpacked packages (`npm pack world-atlas@2 us-atlas@3`, then untar each into
    # world-atlas/ and us-atlas/), for a network that reaches the npm registry but not cdn.jsdelivr.net
    local = os.environ.get("GLOBE_NPM_DIR")
    if local:
        pkg, path = name.split("/", 1)
        return json.load(open(os.path.join(local, pkg.rsplit("@", 1)[0], path)))
    req = urllib.request.Request(f"https://cdn.jsdelivr.net/npm/{name}", headers={"User-Agent": "weski-build"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def arcs_of(topo):
    sx, sy = topo["transform"]["scale"]
    ox, oy = topo["transform"]["translate"]
    res = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + ox, y * sy + oy))
        res.append(pts)
    return res


def polys(geom):
    return geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]] if geom["type"] == "Polygon" else []


def usage(topo, obj):
    use = {}
    for g in topo["objects"][obj]["geometries"]:
        for poly in polys(g):
            for ring in poly:
                for k in ring:
                    k = k if k >= 0 else ~k
                    use[k] = use.get(k, 0) + 1
    return use


def thin(pts, step):
    """Drop points closer than `step` degrees to the previous kept one (keeps both ends)."""
    res = [pts[0]]
    for p in pts[1:-1]:
        if abs(p[0] - res[-1][0]) + abs(p[1] - res[-1][1]) >= step:
            res.append(p)
    res.append(pts[-1])
    return res


def clip(pts, boxes, inside):
    """Split a line into the runs that are inside (or outside) the detail boxes."""
    runs, cur = [], []
    for p in pts:
        hit = any(b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3] for b in boxes)
        if hit == inside:
            cur.append(p)
        else:
            if len(cur) > 1:
                runs.append(cur)
            cur = [p] if False else []
    if len(cur) > 1:
        runs.append(cur)
    return runs


# box around every resort that has a built map (plus a generous margin)
ids = [d for d in json.load(open(f"{out}/index.json"))]
# one box per group of nearby resorts, so mountains on other continents don't make the whole world detailed
BOX = []
for r in ids:
    b = [r["lon"] - 7, r["lat"] - 5, r["lon"] + 7, r["lat"] + 5]
    for o in BOX:
        if b[0] <= o[2] and o[0] <= b[2] and b[1] <= o[3] and o[1] <= b[3]:
            o[:] = [min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3])]
            break
    else:
        BOX.append(b)

w50 = get("world-atlas@2/countries-50m.json")
a50 = arcs_of(w50)
land, water = [], []
for g in w50["objects"]["land"]["geometries"]:
    for poly in polys(g):
        pts = []
        for k in poly[0]:
            a = a50[k] if k >= 0 else a50[~k][::-1]
            pts.extend(a if not pts else a[1:])
        land.append(thin(pts, 0.02))
        # holes in the land are inland seas (the Caspian): painted back as water by the app
        for hole in poly[1:]:
            pts = []
            for k in hole:
                a = a50[k] if k >= 0 else a50[~k][::-1]
                pts.extend(a if not pts else a[1:])
            water.append(thin(pts, 0.02))
u50 = usage(w50, "countries")
coast, borders = [], []
for k, n in u50.items():
    for run in clip(a50[k], BOX, False):
        (coast if n == 1 else borders).append(thin(run, 0.02))

us = get("us-atlas@3/states-10m.json")
aus = arcs_of(us)
states = [thin(aus[k], 0.012) for k, n in usage(us, "states").items() if n > 1]

w10 = get("world-atlas@2/countries-10m.json")
a10 = arcs_of(w10)
hi_coast, hi_border = [], []
for k, n in usage(w10, "countries").items():
    for run in clip(a10[k], BOX, True):
        (hi_coast if n == 1 else hi_border).append(thin(run, 0.004))

layers = {"land": land, "coast": coast, "borders": borders, "states": states, "hiCoast": hi_coast, "hiBorders": hi_border, "water": water}
blob = bytearray()
meta = {"scale": SCALE, "box": BOX, "source": "Natural Earth 1:50m and 1:10m, US Census state lines (public domain) via world-atlas / us-atlas"}
for name, lists in layers.items():
    meta[name] = [len(l) for l in lists]
    for l in lists:
        for lon, lat in l:
            blob += int(round(max(-180, min(180, lon)) * SCALE)).to_bytes(2, "little", signed=True)
            blob += int(round(max(-90, min(90, lat)) * SCALE)).to_bytes(2, "little", signed=True)
open(f"{out}/globe.bin", "wb").write(blob)
json.dump(meta, open(f"{out}/globe.json", "w"), separators=(",", ":"))
print({k: (len(v), sum(len(l) for l in v)) for k, v in layers.items()}, "bytes", len(blob), "boxes", [[round(v, 1) for v in b] for b in BOX])
