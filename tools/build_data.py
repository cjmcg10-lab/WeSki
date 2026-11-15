#!/usr/bin/env python3
"""Build WeSki resort data for Jay Peak from free sources.

Inputs (downloaded separately, see tools/README.md):
  - USGS 3DEP 1 m LiDAR DEM GeoTIFFs (VT_Statewide_A23, EPSG:26918)
  - OpenStreetMap extract (.osm XML) from api.openstreetmap.org
Outputs (public/data):
  - terrain.bin   Uint16 little-endian heights (decimetres above zmin), row 0 = south
  - resort.json   projection, trails, lifts, buildings, POIs, zones, routing graph

Everything specific to one resort lives in tools/resorts/<id>.json (see README).

usage: build_data.py <resort.json config> <osm.xml> <out_dir> <dem.tif> [<dem.tif> ...]
"""
import json
import math
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring

CELL = 14.0          # terrain grid spacing, metres
MARGIN = 450.0       # margin around the resort features, metres

LIFT_KINDS = {"cable_car": "tram", "gondola": "gondola", "chair_lift": "chair", "mixed_lift": "chair", "magic_carpet": "carpet",
              "t-bar": "surface", "j-bar": "surface", "platter": "surface", "drag_lift": "surface", "rope_tow": "surface"}
DIFF = {"novice": 0, "easy": 0, "intermediate": 1, "advanced": 2, "expert": 3, "extreme": 3, "freeride": 3}
WALK_HIGHWAYS = {"footway", "steps", "pedestrian", "path", "service", "residential", "unclassified", "living_street"}


def main():
    cfg = json.load(open(sys.argv[1]))
    osm_path, out_dir, dems = sys.argv[2], sys.argv[3], sys.argv[4:]
    SLOW_ZONE_TRAILS = set(cfg.get("slow_zone_trails", []))
    root = ET.parse(osm_path).getroot()
    srcs = [rasterio.open(p) for p in dems]
    CRS = srcs[0].crs                       # the LiDAR tiles' own projection (a UTM zone)
    tf = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    nodes = {}
    node_tags = {}
    for n in root.findall("node"):
        nodes[n.get("id")] = tf.transform(float(n.get("lon")), float(n.get("lat")))
        tags = {t.get("k"): t.get("v") for t in n.findall("tag")}
        if tags:
            node_tags[n.get("id")] = tags
    ways = []
    for w in root.findall("way"):
        nd = [x.get("ref") for x in w.findall("nd")]
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        if all(i in nodes for i in nd) and len(nd) >= 2:
            ways.append((w.get("id"), nd, tags))

    pistes = [w for w in ways if w[2].get("piste:type") == "downhill"]
    lifts = [w for w in ways if w[2].get("aerialway") in LIFT_KINDS]
    # Keep only this resort: neighbouring ski areas often share a ridge (Stowe / Smugglers' Notch).
    # The resort's own boundary in OpenStreetMap (landuse=winter_sports) decides what belongs.
    area = None
    for wid, nd, t in ways:
        if t.get("landuse") == "winter_sports" and t.get("name") == cfg.get("area_name") and nd[0] == nd[-1]:
            area = Polygon([nodes[i] for i in nd]).buffer(cfg.get("area_buffer", 150))
    if cfg.get("area_name"):
        assert area is not None, f"no winter_sports area named {cfg['area_name']!r} in the OSM extract"
        inside_area = lambda w: sum(area.contains(Point(nodes[i])) for i in w[1]) >= 0.5 * len(w[1])
        pistes = [w for w in pistes if inside_area(w)]
        lifts = [w for w in lifts if inside_area(w)]

    # ---- bounds (UTM) from pistes + lifts
    core = [w for w in pistes if w[2].get("area") != "yes"] + lifts   # backcountry freeride areas don't set the extent
    xs = [nodes[i][0] for w in core for i in w[1]]
    ys = [nodes[i][1] for w in core for i in w[1]]
    x0 = math.floor((min(xs) - MARGIN) / CELL) * CELL
    y0 = math.floor((min(ys) - MARGIN) / CELL) * CELL
    nx = int(math.ceil((max(xs) + MARGIN - x0) / CELL)) + 1
    ny = int(math.ceil((max(ys) + MARGIN - y0) / CELL)) + 1

    # ---- terrain: average 1 m LiDAR cells into CELL-sized samples centred on grid nodes
    b = (x0 - CELL / 2, y0 - CELL / 2, x0 + (nx - 0.5) * CELL, y0 + (ny - 0.5) * CELL)
    arr, _ = merge(srcs, bounds=b, res=CELL, resampling=Resampling.average, nodata=-999999.0)
    h = arr[0][::-1, :].astype(np.float64)[:ny, :nx]   # row 0 = south
    assert h.shape == (ny, nx), (h.shape, ny, nx)
    assert (h > -1000).all(), "DEM has holes inside the resort bounds"
    zmin = math.floor(h.min())
    q = np.round((h - zmin) * 10).astype("<u2")
    with open(f"{out_dir}/terrain.bin", "wb") as f:
        f.write(q.tobytes())
    hq = q.astype(np.float64) / 10 + zmin

    def elev(x, y):
        """Bilinear elevation at local coords (same as the client)."""
        fx = min(max(x / CELL, 0), nx - 1.001)
        fy = min(max(y / CELL, 0), ny - 1.001)
        i, j = int(fx), int(fy)
        u, v = fx - i, fy - j
        return float(hq[j, i] * (1 - u) * (1 - v) + hq[j, i + 1] * u * (1 - v) + hq[j + 1, i] * (1 - u) * v + hq[j + 1, i + 1] * u * v)

    def loc(i):
        e, n = nodes[i]
        return (e - x0, n - y0)

    W, H = (nx - 1) * CELL, (ny - 1) * CELL

    def inside(p, pad=0):
        return pad <= p[0] <= W - pad and pad <= p[1] <= H - pad

    # ---- projection polynomial (lat/lon <-> local metres), fitted to the real UTM transform
    inv = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    lon_c, lat_c = inv.transform(x0 + W / 2, y0 + H / 2)
    gx, gy = np.meshgrid(np.linspace(-800, W + 800, 25), np.linspace(-800, H + 800, 25))
    glon, glat = inv.transform(gx + x0, gy + y0)
    dlon, dlat = (glon - lon_c).ravel(), (glat - lat_c).ravel()

    def basis(a, b_):
        return np.stack([np.ones_like(a), a, b_, a * a, a * b_, b_ * b_, a ** 3, a * a * b_, a * b_ * b_, b_ ** 3], axis=1)

    A = basis(dlon, dlat)
    cx = np.linalg.lstsq(A, gx.ravel(), rcond=None)[0]
    cy = np.linalg.lstsq(A, gy.ravel(), rcond=None)[0]
    err_f = max(np.abs(A @ cx - gx.ravel()).max(), np.abs(A @ cy - gy.ravel()).max())
    B = basis(gx.ravel() - W / 2, gy.ravel() - H / 2)
    clon = np.linalg.lstsq(B, dlon, rcond=None)[0]
    clat = np.linalg.lstsq(B, dlat, rcond=None)[0]
    err_i = max(np.abs(B @ clon - dlon).max(), np.abs(B @ clat - dlat).max()) * 111000
    print(f"grid {nx}x{ny} cell {CELL} m, {W:.0f}x{H:.0f} m, z {h.min():.0f}..{h.max():.0f}; proj fit err {err_f:.4f} m / {err_i:.4f} m")

    # ---- trails
    def densify(pts, step=10.0):
        out = [pts[0]]
        for a, b_ in zip(pts, pts[1:]):
            d = math.dist(a, b_)
            n = max(1, int(math.ceil(d / step)))
            for k in range(1, n + 1):
                out.append((a[0] + (b_[0] - a[0]) * k / n, a[1] + (b_[1] - a[1]) * k / n))
        return out

    trails = []
    trail_ways = []   # parallel: osm node id lists (oriented)
    areas = []
    for wid, nd, t in pistes:
        pts = [loc(i) for i in nd]
        name = t.get("name") or t.get("piste:name")
        diff = DIFF.get(t.get("piste:difficulty"), 1)
        if t.get("area") == "yes":
            if name and all(inside(p) for p in pts):
                areas.append({"name": name, "d": diff, "pts": flat(pts)})
            continue
        if not all(inside(p) for p in pts):
            continue
        if elev(*pts[-1]) > elev(*pts[0]) + 3:
            pts.reverse()
            nd = nd[::-1]
        line = LineString(pts)
        trails.append({
            "id": len(trails), "osm": int(wid), "name": name, "d": diff,
            "glade": t.get("gladed") == "yes", "groom": t.get("piste:grooming"),
            "slow": name in SLOW_ZONE_TRAILS, "bridge": t.get("bridge") == "yes",
            "len": round(line.length), "top": round(elev(*pts[0])), "bot": round(elev(*pts[-1])),
            "pts": flat(densify(pts)),
            "_line": line,
        })
        trail_ways.append(nd)

    # ---- lifts
    lift_out = []
    lift_ways = []
    for wid, nd, t in lifts:
        pts = [loc(i) for i in nd]
        if elev(*pts[-1]) < elev(*pts[0]):
            pts.reverse()
            nd = nd[::-1]
        line = LineString(pts)
        kind = LIFT_KINDS[t["aerialway"]]
        name = t.get("name") or {"carpet": "Magic carpet", "surface": "Surface lift"}.get(kind, "Lift")
        speed = {"tram": 8.0, "gondola": 5.0, "chair": 2.4, "carpet": 0.8, "surface": 2.5}[kind]
        if "Express" in name:
            speed = 5.0
        dur = float(t["aerialway:duration"]) * 60 if "aerialway:duration" in t else line.length / speed
        towers = [flat([loc(i)])  for i in nd[1:-1] if node_tags.get(i, {}).get("aerialway") == "pylon"]
        lift_out.append({
            "id": len(lift_out), "osm": int(wid), "name": name, "kind": kind,
            "seats": int(t.get("aerialway:occupancy", 0) or 0), "len": round(line.length),
            "dur": round(dur), "bot": round(elev(*pts[0])), "top": round(elev(*pts[-1])),
            # can be ridden in either direction (a lift linking two base areas): tagged in OSM, or listed in the resort config
            "both": t.get("oneway") == "no" or name in cfg.get("two_way_lifts", []),
            "pts": flat(pts), "towers": [p for tw in towers for p in tw],
            "_line": line,
        })
        lift_ways.append(nd)

    # ---- buildings
    buildings = []
    for wid, nd, t in ways:
        if "building" not in t or nd[0] != nd[-1] or len(nd) < 4:
            continue
        pts = [loc(i) for i in nd[:-1]]
        if not all(inside(p, 30) for p in pts):
            continue
        poly = Polygon(pts)
        if not poly.is_valid or poly.area < 12:
            continue
        if poly.exterior.is_ccw is False:
            pts.reverse()
        levels = t.get("building:levels")
        bt = t.get("building")
        if levels:
            ht = float(levels) * 3.3
        elif bt == "hotel" or t.get("tourism") == "hotel":
            ht = 15
        elif bt == "apartments":
            ht = 9
        elif poly.area > 1500:
            ht = 11
        elif poly.area < 60:
            ht = 3.5
        else:
            ht = 6.5
        buildings.append({"name": t.get("name"), "h": ht, "pts": flat(pts), "roof": bt == "roof",
                          "kind": "hotel" if t.get("tourism") == "hotel" or bt in ("hotel", "apartments") else "bldg"})

    # ---- POIs
    pois = []

    def add_poi(name, kind, p):
        if name in cfg.get("skip_pois", []) and kind != "peak":
            return   # generic resort markers that duplicate the lodge/summit labels
        if name and inside(p, 20):
            pois.append({"id": len(pois), "name": name, "kind": kind, "x": round(p[0], 1), "y": round(p[1], 1)})

    def poi_kind(t):
        if t.get("amenity") in ("restaurant", "fast_food", "cafe", "bar", "pub"):
            return "food"
        if t.get("tourism") == "hotel" or t.get("building") == "hotel":
            return "lodge"
        if t.get("natural") == "peak":
            return "peak"
        if t.get("amenity") == "parking":
            return "parking"
        if t.get("shop") or t.get("leisure") or t.get("amenity") in ("cinema", "childcare") or t.get("tourism") == "information":
            return "service"
        if t.get("amenity") == "shelter":
            return "shelter"
        return None

    seen = set()
    for wid, nd, t in ways:
        if "building" in t and t.get("name"):
            k = "lodge" if "Lodge" in t["name"] else (poi_kind(t) or "service")
            c = Polygon([loc(i) for i in nd]).centroid
            add_poi(t["name"], k, (c.x, c.y))
            seen.add(t["name"])
    for i, t in node_tags.items():
        k = poi_kind(t)
        if k and t.get("name") and t["name"] not in seen and t.get("aerialway") != "station":
            add_poi(t["name"], k, loc(i))
    for L in lift_out:
        p = L["pts"]
        add_poi(f"{L['name']} (base)", "lift", (p[0], p[1]))
        add_poi(f"{L['name']} (top)", "lifttop", (p[-2], p[-1]))

    # ---- routing graph
    G = GraphBuilder(elev)
    gw = []   # graph ways: dict(kind, ref, line, osm_nodes, bridge)
    for T, nd in zip(trails, trail_ways):
        gw.append({"k": "p", "ref": T["id"], "line": T["_line"], "nd": nd, "bridge": T["bridge"]})
    for L, nd in zip(lift_out, lift_ways):
        gw.append({"k": "l", "ref": L["id"], "line": L["_line"], "nd": nd, "bridge": True, "bi": L["both"]})
    bases = [Point(L["pts"][0], L["pts"][1]) for L in lift_out]
    walk_ways = []
    for wid, nd, t in ways:
        if "piste:type" in t and t["piste:type"] != "connection":
            continue
        hw = t.get("highway")
        if not (hw in WALK_HIGHWAYS or t.get("piste:type") == "connection"):
            continue
        if hw == "path" and ("mtb:scale:imba" in t or "mtb:scale" in t):
            continue
        pts = [loc(i) for i in nd]
        line = LineString(pts)
        if not all(inside(p, 20) for p in pts) or min(line.distance(b_) for b_ in bases) > 420:
            continue
        walk_ways.append({"k": "w", "ref": -1, "line": line, "nd": nd, "bridge": False})
    gw += walk_ways
    for w in gw:
        w["cuts"] = []

    def cut(w, pt):
        """Register a graph node on way w at the point of the way nearest to pt."""
        d = w["line"].project(Point(pt))
        p = w["line"].interpolate(d)
        nid = G.node((p.x, p.y))
        w["cuts"].append((d, nid))
        return nid

    for w in gw:
        c = list(w["line"].coords)
        cut(w, c[0])
        cut(w, c[-1])
    # shared OSM nodes
    use = defaultdict(set)
    for wi, w in enumerate(gw):
        for i in (w["nd"] if w["k"] != "l" else (w["nd"][0], w["nd"][-1])):
            use[i].add(wi)
    for i, ws in use.items():
        if len(ws) > 1:
            for wi in ws:
                cut(gw[wi], loc(i))
    # geometric crossings between trails
    ps = [w for w in gw if w["k"] == "p" and not w["bridge"]]
    for a in range(len(ps)):
        for b_ in range(a + 1, len(ps)):
            if ps[a]["line"].distance(ps[b_]["line"]) > 0:
                continue
            x = ps[a]["line"].intersection(ps[b_]["line"])
            for g in getattr(x, "geoms", [x]):
                if g.geom_type == "Point":
                    cut(ps[a], (g.x, g.y))
                    cut(ps[b_], (g.x, g.y))
    links = []   # (a, b, kind, bidirectional)
    # trail endpoints that end beside another trail without touching it
    for w in ps:
        c = list(w["line"].coords)
        for end, pt in ((0, c[0]), (1, c[-1])):
            nid = G.node(pt)
            for o in ps:
                if o is w:
                    continue
                d = o["line"].distance(Point(pt))
                if d < 0.5 or d > 38:
                    continue
                oid = cut(o, pt)
                if oid != nid:
                    links.append((oid, nid, "x", False) if end == 0 else (nid, oid, "x", False))
    # lifts: unload at top onto nearby trails, reach the bottom from nearby trails
    ls = [w for w in gw if w["k"] == "l"]
    ww = [w for w in gw if w["k"] == "w"]
    for w in ls:
        c = list(w["line"].coords)
        bot, top = G.node(c[0]), G.node(c[-1])
        for o in ps:
            if o["line"].distance(Point(c[-1])) < 110:
                links.append((top, cut(o, c[-1]), "x", bool(w.get("bi"))))
            if o["line"].distance(Point(c[0])) < 110:
                links.append((cut(o, c[0]), bot, "x", bool(w.get("bi"))))
        for o in ls:
            oc = list(o["line"].coords)
            if o is not w and math.dist(oc[0], c[0]) < 220:
                links.append((bot, G.node(oc[0]), "w", True))
            if o is not w and math.dist(oc[0], c[-1]) < 120:     # top of one lift beside base of another
                links.append((top, G.node(oc[0]), "w", True))

    def snap_walk(pt, nid, maxd=90):
        best = min(ww, key=lambda o: o["line"].distance(Point(pt)), default=None)
        if best is not None and best["line"].distance(Point(pt)) < maxd:
            links.append((nid, cut(best, pt), "w", True))
            return True
        return False

    for w in ls:
        c = list(w["line"].coords)
        snap_walk(c[0], G.node(c[0]))
    for w in ps:   # trail run-outs near the villages join the walking network
        c = list(w["line"].coords)
        snap_walk(c[-1], G.node(c[-1]), 60)

    # edges from ways
    edges = []
    for w in gw:
        cuts = sorted(set((round(d, 2), n) for d, n in w["cuts"]))
        for (d1, n1), (d2, n2) in zip(cuts, cuts[1:]):
            if n1 == n2 or d2 - d1 < 0.05:
                continue
            seg = substring(w["line"], d1, d2)
            pts = list(seg.coords)
            if w["k"] != "l":
                pts = densify(pts, 12.0)
            edges.append({"a": n1, "b": n2, "k": w["k"], "r": w["ref"], "len": round(d2 - d1, 1),
                          "bi": w["k"] == "w" or bool(w.get("bi")), "pts": flat(pts)})
    # POIs join the network through a short walk
    all_lines = [(w, w["line"]) for w in gw if w["k"] != "l"]
    for P in pois:
        pt = (P["x"], P["y"])
        if P["kind"] in ("lift", "lifttop"):
            P["n"] = G.node(pt)
            continue
        w, line = min(all_lines, key=lambda wl: wl[1].distance(Point(pt)))
        if line.distance(Point(pt)) > 160:
            P["n"] = -1
            continue
        pn = G.node(pt, merge=False)
        P["n"] = pn
        links.append((pn, cut(w, pt), "w", True))
    # (re)build edges once more now POI cuts exist
    edges = []
    for w in gw:
        cuts = sorted(set((round(d, 2), n) for d, n in w["cuts"]))
        for (d1, n1), (d2, n2) in zip(cuts, cuts[1:]):
            if n1 == n2 or d2 - d1 < 0.05:
                continue
            pts = list(substring(w["line"], d1, d2).coords)
            if w["k"] != "l":
                pts = densify(pts, 12.0)
            edges.append({"a": n1, "b": n2, "k": w["k"], "r": w["ref"], "len": round(d2 - d1, 1),
                          "bi": w["k"] == "w" or bool(w.get("bi")), "pts": flat(pts)})
    seen_l = set()
    for a, b_, k, bi in links:
        if a == b_ or (a, b_) in seen_l or (bi and (b_, a) in seen_l):
            continue
        seen_l.add((a, b_))
        pa, pb = G.pts[a], G.pts[b_]
        edges.append({"a": a, "b": b_, "k": k, "r": -1, "len": round(max(math.dist(pa, pb), 1), 1), "bi": bi,
                      "pts": flat([pa, pb])})

    report(G, edges, trails, lift_out, pois)

    # ---- parks (geometry derived from the trail they sit on)
    # config: [name, trail, lateral offset in m (+ = skier's left), level, note]
    parks = []
    for name, tname, off, level, note in cfg.get("parks", []):
        segs = [T for T in trails if T["name"] == tname]
        assert segs, f"park {name!r}: no trail named {tname!r}"
        for T in segs:
            line = T["_line"]
            if off:
                line = line.parallel_offset(off, "left")
                if line.geom_type != "LineString":
                    line = max(line.geoms, key=lambda g: g.length)
            parks.append({"name": name, "level": level, "note": note, "trail": T["id"],
                          "pts": flat(densify(list(line.coords)))})
    # config: [name, trail A, trail B, note] - a park the trail map shows between two trails (position approximate)
    for name, ta, tb, note in cfg.get("parks_between", []):
        la = [T["_line"] for T in trails if T["name"] == ta]
        lb = [T["_line"] for T in trails if T["name"] == tb]
        assert la and lb, f"park {name!r}: trails {ta!r} / {tb!r} not found"
        a, b_ = max(la, key=lambda l: l.length), max(lb, key=lambda l: l.length)
        mid = [((pa.x + pb.x) / 2, (pa.y + pb.y) / 2) for pa, pb in
               ((a.interpolate(f, normalized=True), b_.interpolate(f, normalized=True)) for f in np.linspace(0.15, 0.75, 8))]
        parks.append({"name": name, "level": "Terrain park", "trail": -1, "approx": True, "note": note,
                      "pts": flat(densify(mid))})
    missing = SLOW_ZONE_TRAILS - {T["name"] for T in trails}
    assert not missing, f"slow-zone trails not found in OSM: {missing}"

    for T in trails + lift_out:
        del T["_line"]
    pois = [P for P in pois if P["n"] >= 0]
    for i, P in enumerate(pois):
        P["id"] = i
    # summary used by the resort picker and the weather window
    main = [L for L in lift_out if L["kind"] not in ("carpet", "surface")] or lift_out
    hi = max(main, key=lambda L: L["top"])
    lo = min(main, key=lambda L: L["bot"])
    ll = lambda x, y: [round(v, 5) for v in reversed(inv.transform(x + x0, y + y0))]
    top_el = max(max(T["top"] for T in trails), hi["top"])
    out = {
        "id": cfg["id"], "name": cfg["name"], "region": cfg["region"], "tz": cfg["tz"],
        "summary": {
            "top": top_el, "base": lo["bot"], "trails": len({T["name"] for T in trails if T["name"]}), "lifts": len(lift_out),
            "summit": ll(hi["pts"][-2], hi["pts"][-1]), "baseAt": ll(lo["pts"][0], lo["pts"][1]),
        },
        "sources": {
            "terrain": cfg.get("terrain_source", "USGS 3DEP 1 m LiDAR DEM (public domain)"),
            "map": "© OpenStreetMap contributors (ODbL)",
            **({"zones": cfg["zones_source"]} if cfg.get("zones_source") else {}),
        },
        "grid": {"nx": nx, "ny": ny, "cell": CELL, "zmin": zmin, "zmax": round(float(h.max()), 1)},
        "proj": {"lon0": lon_c, "lat0": lat_c, "cx": list(cx), "cy": list(cy),
                 "xm": W / 2, "ym": H / 2, "clon": list(clon), "clat": list(clat)},
        "trails": trails, "areas": areas, "lifts": lift_out, "buildings": buildings, "pois": pois,
        "parks": parks,
        "graph": {"nodes": [[round(p[0], 1), round(p[1], 1), round(elev(*p), 1)] for p in G.pts], "edges": edges},
    }
    with open(f"{out_dir}/resort.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"trails {len(trails)} areas {len(areas)} lifts {len(lift_out)} buildings {len(buildings)} pois {len(pois)} "
          f"parks {len(parks)} nodes {len(G.pts)} edges {len(edges)} slow {sum(T['slow'] for T in trails)}")


def flat(pts):
    return [round(v, 1) for p in pts for v in p]


class GraphBuilder:
    def __init__(self, elev):
        self.pts = []
        self.grid = {}
        self.elev = elev

    def node(self, p, merge=True):
        key = (int(p[0] // 3), int(p[1] // 3))
        if merge:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for i in self.grid.get((key[0] + dx, key[1] + dy), []):
                        if math.dist(self.pts[i], p) < 2.0:
                            return i
        self.pts.append((float(p[0]), float(p[1])))
        self.grid.setdefault(key, []).append(len(self.pts) - 1)
        return len(self.pts) - 1


def report(G, edges, trails, lifts, pois):
    adj = defaultdict(list)
    for e in edges:
        adj[e["a"]].append(e["b"])
        if e["bi"]:
            adj[e["b"]].append(e["a"])

    def reach(src):
        seen, st = {src}, [src]
        while st:
            for v in adj[st.pop()]:
                if v not in seen:
                    seen.add(v)
                    st.append(v)
        return seen

    lift_edges = [e for e in edges if e["k"] == "l"]
    # start from the lowest lift base: the main base area
    tram = min(lift_edges, key=lambda e: G.elev(*G.pts[e["a"]]))
    r = reach(tram["a"])
    cover = {e["r"] for e in edges if e["k"] == "p" and e["a"] in r}
    miss = sorted({T["name"] or f"unnamed#{T['id']}" for T in trails if T["id"] not in cover})
    print(f"from the base of {lifts[tram['r']]['name']}: {len(cover)}/{len(trails)} trail segments reachable; not reachable: {miss}")
    for e in lift_edges:
        print(f"  lift {lifts[e['r']]['name']}: base reachable {e['a'] in r}, top leads back to that base {tram['a'] in reach(e['b'])}")
    print("  POIs off-network:", [P["name"] for P in pois if P["n"] < 0],
          "| unreachable:", [P["name"] for P in pois if P["n"] >= 0 and P["n"] not in r])


if __name__ == "__main__":
    main()
