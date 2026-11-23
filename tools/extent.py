#!/usr/bin/env python3
"""Find the whole ski area in an OpenStreetMap extract, so no lift system or bowl is cut off.

A resort is everything joined to it on the ground: runs and lifts whose lines come within LINK metres of each
other. Starting from what lies inside the resort's outline (config area_name) or box (area_bbox), this follows
those joins outward, but never into another resort's named outline. Two mistakes it prevents (Palisades Tahoe,
2026-11-21: the Sherwood Express and its bowl were missing):
  - the download box was too small, so part of the resort was never downloaded;
  - the OpenStreetMap outline of the resort leaves out part of it, so the build dropped that part.

  python3 tools/extent.py <osm> <config.json>      prints the resort's box and what lies outside the outline

Used by tools/pipeline.py (grows the download box until nothing joined to the resort reaches its edge) and by
tools/build_data.py (keeps runs and lifts joined to the resort even when they are outside its outline).
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

LINK = 150          # metres: runs and lifts this close are joined
LIFT_LINK = 250     # a lift station is often a little away from the run lines
RUN_HOPS = 4        # runs followed through other runs only this many steps from a lift of the resort
GONE = ("abandoned", "disused", "removed", "razed", "demolished", "planned", "proposed", "construction",
        "piste:abandoned", "aerialway:abandoned")
SKIP_LIFTS = ("pylon", "station", "goods", "zip_line")


def load(osm):
    root = ET.parse(osm).getroot()
    nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in root.iter("node")}
    ways, tags_of = {}, {}
    for w in root.iter("way"):
        ways[w.get("id")] = [nodes[r.get("ref")] for r in w.findall("nd") if r.get("ref") in nodes]
        tags_of[w.get("id")] = {t.get("k"): t.get("v") for t in w.findall("tag")}
    feats = []
    for wid, t in tags_of.items():
        pts = ways[wid]
        if len(pts) < 2 or any(t.get(k) == "yes" for k in GONE):
            continue
        if t.get("public_transport") in ("platform", "station") or t.get("railway") == "platform" or t.get("building"):
            continue  # a station or platform drawn as a line or a building
        if t.get("piste:type") == "downhill" or (t.get("aerialway") and t["aerialway"] not in SKIP_LIFTS):
            feats.append({"id": int(wid), "lift": "aerialway" in t, "pts": pts, "name": t.get("name") or t.get("piste:name")})
    # named resort outlines: closed ways, and the outer rings of multipolygon relations
    areas = []
    for wid, t in tags_of.items():
        if t.get("landuse") == "winter_sports" and t.get("name") and len(ways[wid]) > 3 and ways[wid][0] == ways[wid][-1]:
            areas.append((t["name"], [ways[wid]]))
    for r in root.iter("relation"):
        t = {x.get("k"): x.get("v") for x in r.findall("tag")}
        if t.get("landuse") == "winter_sports" and t.get("name"):
            parts = [ways[m.get("ref")] for m in r.findall("member")
                     if m.get("type") == "way" and m.get("role") in ("outer", "") and ways.get(m.get("ref"))]
            rings = rings_from(parts)
            if rings:
                areas.append((t["name"], rings))
    return feats, areas


def rings_from(parts):
    """Join the outer member ways of a relation into closed rings (they are often split into pieces)."""
    parts = [list(p) for p in parts if len(p) > 1]
    rings = []
    while parts:
        ring = parts.pop()
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, p in enumerate(parts):
                if p[0] == ring[-1]:
                    ring += p[1:]
                elif p[-1] == ring[-1]:
                    ring += p[::-1][1:]
                elif p[-1] == ring[0]:
                    ring = p[:-1] + ring
                elif p[0] == ring[0]:
                    ring = p[::-1][:-1] + ring
                else:
                    continue
                parts.pop(i)
                changed = True
                break
        if len(ring) > 3:
            rings.append(ring)
    return rings


def inside(p, ring):
    x, y, c = p[0], p[1], False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def in_area(f, rings, share=0.5):
    pts = f["pts"]
    return sum(any(inside(p, r) for r in rings) for p in pts) >= share * len(pts)


def resort(feats, areas, cfg, buffer_m=None):
    """The ids of every run and lift that belongs to the resort, and how each was found."""
    resort.blocked = []
    lat0 = sum(p[1] for f in feats for p in f["pts"][:1]) / max(1, len(feats))
    kx, ky = 111320 * math.cos(math.radians(lat0)), 111320.0
    own_names = {cfg.get("area_name")} | set(cfg.get("area_names", []))
    own = [r for n, rs in areas if n in own_names for r in rs]
    foreign = [(n, rs) for n, rs in areas if n not in own_names]
    buf = (cfg.get("area_buffer", 150) if buffer_m is None else buffer_m)
    if own:
        # a lift just outside the outline may be a neighbour's (Deer Valley's Empire Express at Park City)
        seed = {f["id"] for f in feats if in_area(f, own) or (not f["lift"] and near_ring(f, own, buf, kx, ky))}
    elif cfg.get("area_bbox"):
        w, s, e, n = cfg["area_bbox"]
        bx, by = buf / kx, buf / ky
        seed = {f["id"] for f in feats
                if sum(w - bx <= p[0] <= e + bx and s - by <= p[1] <= n + by for p in f["pts"]) >= 0.5 * len(f["pts"])}
    elif cfg.get("include_ways"):
        # no outline we can read (automatic configs, issue #45): start from the resort's own lifts, as
        # OpenSkiMap assigns them, and follow everything joined to them
        seed = set()
    else:
        return {f["id"] for f in feats}, set()
    seed |= {f["id"] for f in feats if f["id"] in set(cfg.get("include_ways", []))}  # lifts found by name
    listed = cfg.get("_lifts")
    if listed is None and cfg.get("id"):
        offp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "official", f"{cfg['id']}.json")
        listed = json.load(open(offp)).get("lifts", []) if os.path.exists(offp) else []
    from official_ratings import missing_lifts, lift_key
    # a listed name made only of lift words ("Gondola", "Cabriolet", "Chair 12") cannot be told apart by name:
    # missing_lifts treats it as always present, which made every lift match (Park City's Cabriolet once
    # pulled in all of Deer Valley and the Cottonwood canyons)
    listed = [n for n in listed or [] if lift_key(n)]

    def ours_by_name(f):
        return bool(listed) and bool(f["name"]) and len(missing_lifts([f["name"]], [])) == 1 and \
            not missing_lifts(listed, [f["name"]]) == listed
    # Another named outline is the resort's own when most of the lifts in it are on the resort's lift list
    # (Palisades has two outlines, one per valley). Holding a few of the resort's lifts is not enough: linked
    # neighbours share lifts across the border (La Plagne / Les Arcs through the Vanoise Express).
    incl = set(cfg.get("include_ways", []))
    mine = []
    for n, rs in foreign:
        lifts_in = [f for f in feats if f["lift"] and f["name"] and in_area(f, rs)]
        # (or most of its lifts are the resort's own by OpenStreetMap id: include_ways, from OpenSkiMap)
        if len(lifts_in) >= 2 and sum(ours_by_name(f) or f["id"] in incl for f in lifts_in) >= 0.6 * len(lifts_in):
            mine.append(n)
    if mine:
        seed |= {f["id"] for f in feats for n, rs in foreign if n in mine and in_area(f, rs)}
    foreign = [(n, rs) for n, rs in foreign if n not in mine]
    other = {f["id"]: n for f in feats if f["id"] not in seed for n, rs in foreign if in_area(f, rs)}
    # The resort's own lift list (official json "lifts"): a lift outside the outline joins the resort only when
    # its name is on it. Any other lift is a neighbour's (La Plagne / Les Arcs, Park City / Deer Valley): the
    # search stops there and the lift is reported. Runs touching such a lift are not followed either, and runs
    # reached through runs alone are followed at most RUN_HOPS steps from the resort's lifts.
    cell = LIFT_LINK
    grid, pts_m = {}, {}
    for f in feats:
        P = densify([(p[0] * kx, p[1] * ky) for p in f["pts"]], 40)
        pts_m[f["id"]] = P
        for x, y in P:
            grid.setdefault((int(x // cell), int(y // cell)), set()).add(f["id"])
    by_id = {f["id"]: f for f in feats}

    def near(a, b, lim):
        return any((x - u) ** 2 + (y - v) ** 2 < lim * lim for x, y in pts_m[a] for u, v in pts_m[b][::2])

    def touching(fid):
        out = set()
        for x, y in pts_m[fid]:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    out |= grid.get((int(x // cell) + dx, int(y // cell) + dy), set())
        out.discard(fid)
        return out
    blocked = set()
    depth = {i: 0 for i in seed}
    keep, stack = set(seed), list(seed)
    while stack:
        a = stack.pop()
        for b in touching(a):
            if b in keep or b in other or b in blocked:
                continue
            fb = by_id[b]
            lim = LIFT_LINK if (by_id[a]["lift"] or fb["lift"]) else LINK
            if not near(a, b, lim):
                continue
            if fb["lift"]:
                if ours_by_name(fb):
                    depth[b] = 0
                else:
                    blocked.add(b)
                    continue
            else:
                if any(by_id[c]["lift"] and c not in keep and near(b, c, LIFT_LINK) and not ours_by_name(by_id[c])
                       for c in touching(b)):
                    continue  # a run at a neighbour's lift
                depth[b] = 0 if any(c in keep and by_id[c]["lift"] and near(b, c, LIFT_LINK) for c in touching(b)) \
                    else depth[a] + 1
                if depth[b] > RUN_HOPS:
                    continue
            keep.add(b)
            stack.append(b)
    resort.blocked = sorted({by_id[i]["name"] or f"way {i}" for i in blocked})
    return keep, keep - seed


def near_ring(f, rings, buf, kx, ky):
    if buf <= 0:
        return False
    for p in f["pts"][::4] + f["pts"][-1:]:
        for r in rings:
            for q in r[::2]:
                if ((p[0] - q[0]) * kx) ** 2 + ((p[1] - q[1]) * ky) ** 2 < buf * buf:
                    return True
    return False


def densify(P, step):
    out = [P[0]]
    for (x1, y1), (x2, y2) in zip(P, P[1:]):
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) // step))
        out += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(1, n + 1)]
    return out


def extent(feats, ids, margin_m=800):
    pts = [p for f in feats if f["id"] in ids for p in f["pts"]]
    lat0 = sum(p[1] for p in pts) / len(pts)
    mx, my = margin_m / (111320 * math.cos(math.radians(lat0))), margin_m / 111320
    return [round(min(p[0] for p in pts) - mx, 4), round(min(p[1] for p in pts) - my, 4),
            round(max(p[0] for p in pts) + mx, 4), round(max(p[1] for p in pts) + my, 4)]


def check(osm, cfg):
    feats, areas = load(osm)
    keep, added = resort(feats, areas, cfg)
    names = sorted({f["name"] or f"way {f['id']}" for f in feats if f["id"] in added and f["lift"]})
    runs = sorted({f["name"] for f in feats if f["id"] in added and not f["lift"] and f["name"]})
    return {"bbox": extent(feats, keep) if keep else None, "keep": keep, "added": added,
            "neighbour_lifts": getattr(resort, "blocked", []),
            "added_lifts": names, "added_runs": runs}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    r = check(sys.argv[1], json.load(open(sys.argv[2])))
    print("resort box:", r["bbox"])
    print(f"joined to the resort but outside its outline or box: {len(r['added'])} ways; "
          f"lifts: {', '.join(r['added_lifts']) or 'none'}; runs: {', '.join(r['added_runs'][:40]) or 'none'}")
    print("lifts joined on the ground but not the resort's (neighbours, or missing from its lift list):",
          ", ".join(r["neighbour_lifts"]) or "none")
