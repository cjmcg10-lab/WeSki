#!/usr/bin/env python3
"""Start a new resort: write tools/resorts/<id>.json from a name and a point on the mountain.

usage: python3 tools/new_resort.py <id> "<Name>" "<Region, Country>" <lon> <lat> [--tz Area/City]
                                   [--feed mtnpowder:<n>] [--work DIR]

Downloads OpenStreetMap around the point (8 km box), finds the resort's winter-sports area
(the one containing the point, else the nearest), and sets area_name and a bounding box that
covers the area and every run and lift in it. USA: the time zone follows from the state in
the region. Then run:  python3 tools/pipeline.py <id>
"""
import json
import math
import os
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

US_TZ = {
    "America/New_York": ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Connecticut", "Rhode Island",
                         "New York", "New Jersey", "Pennsylvania", "Maryland", "Virginia", "West Virginia",
                         "North Carolina", "Michigan", "Ohio"],
    "America/Chicago": ["Wisconsin", "Minnesota", "Iowa", "Illinois"],
    "America/Denver": ["Colorado", "Utah", "Wyoming", "Montana", "New Mexico", "Idaho"],
    "America/Los_Angeles": ["California", "Nevada", "Oregon", "Washington"],
    "America/Anchorage": ["Alaska"],
}


def tz_for(region):
    """Time zone from the first state named in the region (Idaho's panhandle and Michigan's west edge differ: check)."""
    first = region.split(",")[0].split("/")[0].strip()
    for tz, states in US_TZ.items():
        if first in states:
            return tz
    return None


def main():
    a = sys.argv[1:]
    opt = {"tz": None, "feed": None, "work": os.environ.get("PIPE_WORK", "/tmp/weski-pipe")}
    pos = []
    i = 0
    while i < len(a):
        if a[i] in ("--tz", "--feed", "--work"):
            opt[a[i][2:]] = a[i + 1]; i += 2
        else:
            pos.append(a[i]); i += 1
    if len(pos) != 5:
        raise SystemExit(__doc__)
    rid, name, region, lon, lat = pos[0], pos[1], pos[2], float(pos[3]), float(pos[4])
    out = f"{ROOT}/tools/resorts/{rid}.json"
    if os.path.exists(out):
        raise SystemExit(f"{out} already exists")
    tz = opt["tz"] or (tz_for(region) if region.endswith("USA") else None)
    if not tz:
        raise SystemExit("give the time zone with --tz (e.g. Europe/Zurich)")

    os.makedirs(opt["work"], exist_ok=True)
    osm = f"{opt['work']}/{rid}.seed.osm"
    dy, dx = 4000 / 111320, 4000 / (111320 * math.cos(math.radians(lat)))
    if not os.path.exists(osm):
        subprocess.run([sys.executable, f"{ROOT}/tools/dev/osmget.py", osm, str(lon - dx), str(lat - dy),
                        str(lon + dx), str(lat + dy), "3"], check=True)
    root = ET.parse(osm).getroot()
    nodes = {n.get("id"): (float(n.get("lon")), float(n.get("lat"))) for n in root.findall("node")}
    ways = {}
    for w in root.findall("way"):
        ways[w.get("id")] = ([nodes[n.get("ref")] for n in w.findall("nd") if n.get("ref") in nodes],
                             {t.get("k"): t.get("v") for t in w.findall("tag")})

    def inside(p, poly):
        x, y, c = p[0], p[1], False
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        return c

    areas = [(tags["name"], pts) for pts, tags in ways.values()
             if tags.get("landuse") == "winter_sports" and tags.get("name") and len(pts) > 3 and pts[0] == pts[-1]]
    if not areas:
        print("no named winter-sports area outlined in OpenStreetMap here: the config uses a box instead (area_bbox)")
        area_name, poly = None, None
    else:
        def dist(pts):
            return 0 if inside((lon, lat), pts) else min(math.hypot((x - lon) * math.cos(math.radians(lat)), y - lat) for x, y in pts)
        area_name, poly = min(areas, key=lambda a: dist(a[1]))
        print(f"winter-sports area: {area_name}" + ("" if inside((lon, lat), poly) else " (nearest; the point is outside it)"))

    def near(pts):
        if poly:
            return any(inside(p, poly) for p in pts[::3] + pts[-1:])
        return any(abs(p[0] - lon) < dx / 2 and abs(p[1] - lat) < dy / 2 for p in pts)
    runs = [(pts, t) for pts, t in ways.values() if t.get("piste:type") == "downhill" and near(pts)]
    lifts = [(pts, t) for pts, t in ways.values() if t.get("aerialway") and t["aerialway"] not in ("pylon", "station") and near(pts)]
    every = [p for pts, _ in runs + lifts for p in pts] + (poly or [])
    if not every:
        raise SystemExit("no runs or lifts found near that point: check the coordinates")
    w, s = min(p[0] for p in every), min(p[1] for p in every)
    e, n = max(p[0] for p in every), max(p[1] for p in every)
    m_y, m_x = 800 / 111320, 800 / (111320 * math.cos(math.radians(lat)))
    bbox = [round(w - m_x, 4), round(s - m_y, 4), round(e + m_x, 4), round(n + m_y, 4)]

    cfg = {"id": rid, "name": name, "region": region, "tz": tz}
    if area_name:
        cfg["area_name"], cfg["area_buffer"] = area_name, 300
    else:
        cfg["area_bbox"] = [round(lon - dx / 2, 4), round(lat - dy / 2, 4), round(lon + dx / 2, 4), round(lat + dy / 2, 4)]
    cfg["terrain_source"] = "USGS 3DEP 1 m LiDAR DEM (public domain)" if region.endswith("USA") else "TO FILL IN"
    cfg["osm_bbox"] = bbox
    if opt["feed"]:
        k, v = opt["feed"].split(":")
        cfg["ratings_feed"] = {k: int(v)}
    json.dump(cfg, open(out, "w"), indent=1, ensure_ascii=False)
    open(out, "a").write("\n")
    named = len({t.get("name") for _, t in runs if t.get("name")})
    print(f"wrote {out}: {len(runs)} run ways ({named} named), {len(lifts)} lifts in OpenStreetMap, bbox {bbox}")
    if not region.endswith("USA"):
        print('outside the USA: add the terrain source as "dem": {"source": "swiss" | "ign" | "gsi"} '
              'or {"source": "cog", "epsg": ..., "urls": [...]}, and fill in terrain_source')
    print(f"next: python3 tools/pipeline.py {rid}")


if __name__ == "__main__":
    main()
