#!/usr/bin/env python3
"""Add the real details OpenStreetMap records for a resort's lifts and buildings to its built map, without a rebuild.

usage: python3 -I tools/enrich_osm.py <id> [<id> ...]

Lifts (by their OpenStreetMap way id, from api.openstreetmap.org):
  seats   aerialway:occupancy (people per chair or cabin), when it differs from the build
  cap     aerialway:capacity (people an hour): the app spaces the chairs from it
  bubble  aerialway:bubble=yes (a weather cover)     heat  aerialway:heating=yes     detach  aerialway:detachable
Buildings (matched by footprint centre, within 12 m; from overpass-api.de, or when it does not answer, from an
OpenStreetMap extract downloaded in tiles with tools/dev/osmget.py into $PIPE_WORK):
  roofShape  roof:shape (flat, gabled, hipped, pyramidal, skillion, ...)
  roofCol    roof:colour, or a colour for roof:material (metal, tiles, slate, wood)
  wallCol    building:colour, or a colour for building:material (wood, stone, brick, concrete, glass, metal)
  levels     building:levels
  st         the building's look (tools/building_style.py: lodge, rest, hut, hotel, chapel, tower, service, garage),
             from its tags, named points inside it, size, and whether it stands at a lift station or a summit
Writes public/data/<id>/resort.json in place (the routing graph is kept) and prints what it added.
Re-runnable: fields are replaced each time. Requests use the User-Agent weski-build.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import subprocess
import xml.etree.ElementTree as ET

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import building_style  # noqa: E402  (tools/building_style.py: the building looks)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "weski-build"}
NAMED = {"white": "#f2f2f2", "black": "#2b2b2b", "grey": "#8a8f96", "gray": "#8a8f96", "darkgrey": "#5c6168", "darkgray": "#5c6168",
         "lightgrey": "#c4c7cb", "lightgray": "#c4c7cb", "silver": "#b9bec4", "red": "#a8352c", "darkred": "#7a2620", "maroon": "#6e2a24",
         "brown": "#7a5236", "saddlebrown": "#7a4a26", "sienna": "#8a5134", "tan": "#c8ab84", "beige": "#d8ccb0", "wheat": "#dbc9a0",
         "green": "#3e6e45", "darkgreen": "#2c4d33", "olive": "#6b6b3a", "blue": "#3c5f8a", "navy": "#253a5a", "yellow": "#d8b84a",
         "orange": "#c9772f", "cream": "#e8dfc4", "ivory": "#ece6d2", "terracotta": "#b5603f"}
WALL_MATERIAL = {"wood": "#8a6a4a", "timber_framing": "#9b7a55", "stone": "#9a958c", "brick": "#9c5a45", "concrete": "#b8b4ab",
                 "glass": "#8fb3c9", "metal": "#8d939a", "plaster": "#d8cdb9", "cement_block": "#b0aca3"}
ROOF_MATERIAL = {"metal": "#6e7880", "roof_tiles": "#8c3b2e", "tile": "#8c3b2e", "slate": "#4a5058", "wood": "#6b5136",
                 "shingle": "#5e4a3a", "concrete": "#9d9a94", "asphalt": "#4c5056", "glass": "#8fb3c9", "stone": "#6f6c66",
                 "copper": "#5f8f7a", "tar_paper": "#3f4246"}


def colour(v):
    """An OpenStreetMap colour value as #rrggbb, or None."""
    if not v:
        return None
    v = v.strip().lower().replace(" ", "")
    if v.startswith("#") and len(v) in (4, 7) and all(c in "0123456789abcdef" for c in v[1:]):
        return v if len(v) == 7 else "#" + "".join(c * 2 for c in v[1:])
    return NAMED.get(v)


def get(url, data=None, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except Exception as e:
            if k == tries - 1:
                raise
            print(f"  retry after {e}")
            time.sleep(5 * (k + 1))


def basis(a, b):
    return np.array([1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3])


def buildings(rid, w, s, e, n):
    """([(lon, lat, tags)] of every building in the box, [(lon, lat, tags)] of named or amenity / tourism / shop /
    leisure points, which often sit inside an untagged building): Overpass, or an extract from the main API."""
    q = (f'[out:json][timeout:120];(way["building"]({s},{w},{n},{e});node["amenity"]({s},{w},{n},{e});'
         f'node["tourism"]({s},{w},{n},{e});node["shop"]({s},{w},{n},{e});node["leisure"]({s},{w},{n},{e}););out tags center;')
    try:
        j = get("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), tries=1)
        els = j.get("elements", [])
        return ([(el["center"]["lon"], el["center"]["lat"], el.get("tags", {})) for el in els if el["type"] == "way" and el.get("center")],
                [(el["lon"], el["lat"], el.get("tags", {})) for el in els if el["type"] == "node" and "lon" in el])
    except Exception as err:
        print(f"  overpass did not answer ({err}); downloading an extract instead")
    work = os.environ.get("PIPE_WORK", "/tmp/weski-pipe")
    os.makedirs(work, exist_ok=True)
    osm = f"{work}/{rid}.enrich.osm"
    if not os.path.exists(osm):
        split = max(2, round(max((e - w) * 111 * math.cos(math.radians((s + n) / 2)), (n - s) * 111) / 3))
        subprocess.run([sys.executable, f"{ROOT}/tools/dev/osmget.py", osm, str(w), str(s), str(e), str(n), str(split)], check=True)
    root = ET.parse(osm).getroot()
    nodes, points = {}, []
    for nd in root.iter("node"):
        ll = (float(nd.get("lon")), float(nd.get("lat")))
        nodes[nd.get("id")] = ll
        t = {tg.get("k"): tg.get("v") for tg in nd.findall("tag")}
        if any(k in t for k in ("amenity", "tourism", "shop", "leisure")):
            points.append((*ll, t))
    out = []
    for way in root.iter("way"):
        t = {tg.get("k"): tg.get("v") for tg in way.findall("tag")}
        if "building" not in t:
            continue
        p = [nodes[r.get("ref")] for r in way.findall("nd") if r.get("ref") in nodes]
        if p:
            out.append((sum(x for x, _ in p) / len(p), sum(y for _, y in p) / len(p), t))
    return out, points


def enrich(rid):
    path = f"{ROOT}/public/data/{rid}/resort.json"
    R = json.load(open(path))
    P = R["proj"]
    to_ll = lambda x, y: (P["lon0"] + basis(x - P["xm"], y - P["ym"]) @ np.array(P["clon"]),
                          P["lat0"] + basis(x - P["xm"], y - P["ym"]) @ np.array(P["clat"]))
    to_local = lambda lon, lat: (basis(lon - P["lon0"], lat - P["lat0"]) @ np.array(P["cx"]),
                                 basis(lon - P["lon0"], lat - P["lat0"]) @ np.array(P["cy"]))
    # ---- lifts, by way id
    ids = [l["osm"] for l in R["lifts"] if l.get("osm")]
    tags = {}
    for i in range(0, len(ids), 200):
        j = get("https://api.openstreetmap.org/api/0.6/ways.json?ways=" + ",".join(str(x) for x in ids[i:i + 200]))
        for e in j.get("elements", []):
            tags[e["id"]] = e.get("tags", {})
    n_l = {"seats": 0, "cap": 0, "bubble": 0, "heat": 0, "detach": 0}
    for l in R["lifts"]:
        for k in n_l:
            l.pop(k, None) if k not in ("seats",) else None
        t = tags.get(l.get("osm"), {})
        occ = t.get("aerialway:occupancy", "")
        if occ.isdigit() and 1 <= int(occ) <= 200 and int(occ) != l.get("seats"):
            l["seats"] = int(occ); n_l["seats"] += 1
        cap = t.get("aerialway:capacity", "").replace(",", "")
        if cap.isdigit() and 50 <= int(cap) <= 6000:
            l["cap"] = int(cap); n_l["cap"] += 1
        for k, key in (("bubble", "aerialway:bubble"), ("heat", "aerialway:heating"), ("detach", "aerialway:detachable")):
            if t.get(key) == "yes":
                l[k] = True; n_l[k] += 1
    # ---- buildings, by footprint centre
    g = R["grid"]
    corners = [to_ll(0, 0), to_ll((g["nx"] - 1) * g["cell"], (g["ny"] - 1) * g["cell"])]
    s, w = min(c[1] for c in corners), min(c[0] for c in corners)
    n, e = max(c[1] for c in corners), max(c[0] for c in corners)
    blist, plist = buildings(rid, w, s, e, n)
    osm_b = [(*to_local(lon, lat), t) for lon, lat, t in blist]
    points = [(*to_local(lon, lat), t) for lon, lat, t in plist]
    b_tags = []
    pts = np.array([(x, y) for x, y, _ in osm_b]) if osm_b else np.zeros((0, 2))
    n_b = {"matched": 0, "roofShape": 0, "roofCol": 0, "wallCol": 0, "levels": 0}
    for b in R["buildings"]:
        for k in ("roofShape", "roofCol", "wallCol", "levels", "st"):
            b.pop(k, None)
        b_tags.append({"name": b.get("name") or "", "building": "roof" if b.get("roof") else "hotel" if b.get("kind") == "hotel" else "yes"})
        xs, ys = b["pts"][0::2], b["pts"][1::2]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        if not len(pts):
            continue
        d = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
        k = int(d.argmin())
        if d[k] > 12:      # maps nudged onto the aerial photos (shift_m) can sit up to ~10 m off OpenStreetMap
            continue
        t = osm_b[k][2]
        b_tags[-1] = {**t, "name": t.get("name") or b.get("name") or ""}
        n_b["matched"] += 1
        shape = t.get("roof:shape")
        if shape:
            b["roofShape"] = shape; n_b["roofShape"] += 1
        rc = colour(t.get("roof:colour")) or ROOF_MATERIAL.get(t.get("roof:material", ""))
        if rc:
            b["roofCol"] = rc; n_b["roofCol"] += 1
        wc = colour(t.get("building:colour")) or WALL_MATERIAL.get(t.get("building:material", ""))
        if wc:
            b["wallCol"] = wc; n_b["wallCol"] += 1
        lv = t.get("building:levels", "")
        if lv.isdigit() and 1 <= int(lv) <= 60:
            b["levels"] = int(lv); n_b["levels"] += 1
    # the look of each building (tools/building_style.py), from its tags, the points inside it, size and place
    styles = building_style.add_styles(R["buildings"], b_tags, R["lifts"], R["pois"], points)
    with open(path, "w") as f:
        json.dump(R, f, separators=(",", ":"))
    print(f"{rid}: lifts {len(R['lifts'])} (seats fixed {n_l['seats']}, capacity {n_l['cap']}, bubble {n_l['bubble']}, "
          f"heated {n_l['heat']}, detachable {n_l['detach']}); buildings {len(R['buildings'])} (matched {n_b['matched']}, "
          f"roof shape {n_b['roofShape']}, roof colour {n_b['roofCol']}, wall colour {n_b['wallCol']}, levels {n_b['levels']}); styles {styles}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for rid in sys.argv[1:]:
        enrich(rid)
