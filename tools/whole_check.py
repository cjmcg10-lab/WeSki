#!/usr/bin/env python3
"""Check built mountains for missing parts without rebuilding them: lifts joined to the resort on the ground that
are not on the map, and lifts on the resort's own list (official json "lifts") that are not on the map.

usage: python3 tools/whole_check.py <id> [<id> ...] [--work DIR]

Downloads OpenStreetMap 1.5 km beyond each map's box (the work folder keeps it) and prints one line per
mountain. A mountain with anything listed needs `python3 tools/pipeline.py <id>`, which widens the box and adds
what is missing (see "Getting the whole resort" in docs/ADDING_MOUNTAINS.md).
"""
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import extent  # noqa: E402
from official_ratings import missing_lifts, key  # noqa: E402
from pipeline import built_bbox, pad  # noqa: E402


def main():
    a = sys.argv[1:]
    work = a[a.index("--work") + 1] if "--work" in a else "/tmp/weski-pipe/whole"
    ids = [x for x in a if not x.startswith("--") and x != work]
    os.makedirs(work, exist_ok=True)
    for rid in ids:
        cfg = json.load(open(f"{ROOT}/tools/resorts/{rid}.json"))
        R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
        box = cfg.get("osm_bbox") or built_bbox(rid)
        osm = f"{work}/{rid}.osm"
        if not os.path.exists(osm):
            b = pad(box, 1500)
            span = max(b[2] - b[0], b[3] - b[1])
            r = subprocess.run([sys.executable, f"{HERE}/dev/osmget.py", osm, *map(str, b), str(max(2, math.ceil(span / 0.04)))],
                               capture_output=True, text=True)
            if r.returncode:
                print(f"{rid}: download failed: {r.stderr[-200:]}", flush=True)
                continue
        feats, areas = extent.load(osm)
        keep, _ = extent.resort(feats, areas, cfg)
        neighbours = [n for n in getattr(extent.resort, "blocked", [])
                      if n not in {l["name"] for l in R["lifts"]}]
        on_map = {l.get("osm") for l in R["lifts"]}
        names = [l["name"] for l in R["lifts"] if not l.get("hide")]
        lost = sorted({f["name"] or f"way {f['id']}" for f in feats
                       if f["lift"] and f["id"] in keep and f["id"] not in on_map and (not f["name"] or f["name"] not in names)})
        offp = f"{HERE}/official/{rid}.json"
        off = json.load(open(offp)) if os.path.exists(offp) else {}
        # only runs on the resort's own list count: anything else would be hidden on the map anyway
        official_keys = {key(n) for n in off.get("runs", {})} | {key(n) for n in off.get("same_as", {})}
        ren = {k.lower(): v for k, v in (cfg.get("rename") or {}).items()}
        have = {t["name"].lower() for t in R["trails"] if t.get("name")}
        trail_ids = {t.get("osm") for t in R["trails"]}
        lost_runs = sorted({f["name"] for f in feats if not f["lift"] and f["id"] in keep and f["name"]
                            and f["id"] not in trail_ids
                            and ren.get(f["name"].lower(), f["name"]).lower() not in have
                            and f["id"] not in set(map(int, cfg.get("way_names", {}) or {}))
                            and key(ren.get(f["name"].lower(), f["name"])) in official_keys})
        listed = [n for n in missing_lifts(off.get("lifts", []), names) if n not in off.get("lifts_explained", {})]
        # the box is too small when something of the resort that is not on the map comes near its edge
        inner = pad(box, -300)
        have_ids = on_map | {t.get("osm") for t in R["trails"]}
        grows = any(f["id"] in keep and f["id"] not in have_ids
                    and any(not (inner[0] <= p[0] <= inner[2] and inner[1] <= p[1] <= inner[3]) for p in f["pts"])
                    for f in feats)
        bad = lost or listed
        print(f"{rid}: {'LOOK' if bad else 'ok'}"
              + (f"; joined lifts not on the map: {', '.join(lost)}" if lost else "")
              + (f"; listed lifts not on the map: {', '.join(listed)}" if listed else "")
              + (f"; runs on the resort's list, joined but not on the map: {len(lost_runs)} ({', '.join(lost_runs[:12])})" if lost_runs else "")
              + ("; box would grow" if grows else "")
              + (f"; lifts joined on the ground but not the resort's (check: neighbour or missing): {', '.join(neighbours[:15])}" if neighbours else "")
              + ("" if off.get("lifts") else "; no lift list from the resort"), flush=True)


if __name__ == "__main__":
    main()
