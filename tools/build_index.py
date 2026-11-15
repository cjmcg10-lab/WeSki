#!/usr/bin/env python3
"""List the built resorts for the app's resort picker: public/data/index.json.

usage: build_index.py <public/data dir>
"""
import json
import os
import sys

out = sys.argv[1]
index = []
for d in sorted(os.listdir(out)):
    p = f"{out}/{d}/resort.json"
    if not os.path.exists(p):
        continue
    r = json.load(open(p))
    s = r["summary"]
    size = sum(os.path.getsize(f"{out}/{d}/{f}") for f in os.listdir(f"{out}/{d}"))
    index.append({"id": r["id"], "name": r["name"], "region": r["region"], "tz": r["tz"],
                  "lat": s["summit"][0], "lon": s["summit"][1], "baseLat": s["baseAt"][0], "baseLon": s["baseAt"][1],
                  "top": s["top"], "base": s["base"], "trails": s["trails"], "lifts": s["lifts"],
                  "zones": bool(r["parks"] or any(t["slow"] for t in r["trails"])), "bytes": size})
json.dump(index, open(f"{out}/index.json", "w"), indent=1)
print([(r["id"], r["trails"], r["lifts"], r["bytes"]) for r in index])
