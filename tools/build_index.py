#!/usr/bin/env python3
"""List the built resorts for the app's resort picker: public/data/index.json.

usage: build_index.py <public/data dir> [--with-held]

A resort whose config carries "hold" (the automatic builder's quality gate held it for a person's look,
tools/bulk/gate.py) is left out, unless --with-held (used only for the preview site, never for the live index).
Each entry says whether the ratings were checked against the resort's own list ("checked") and, for maps on 30 m
terrain, "coarse": the app's resort card says both.
"""
import json
import os
import sys

out = sys.argv[1]
with_held = "--with-held" in sys.argv
cfgdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resorts")
index = []
for d in sorted(os.listdir(out)):
    p = f"{out}/{d}/resort.json"
    if not os.path.exists(p):
        continue
    cp = f"{cfgdir}/{d}.json"
    if not with_held and os.path.exists(cp) and json.load(open(cp)).get("hold"):
        continue
    r = json.load(open(p))
    s = r["summary"]
    size = sum(os.path.getsize(f"{out}/{d}/{f}") for f in os.listdir(f"{out}/{d}"))
    index.append({"id": r["id"], "name": r["name"], "region": r["region"], "tz": r["tz"],
                  "lat": s["summit"][0], "lon": s["summit"][1], "baseLat": s["baseAt"][0], "baseLon": s["baseAt"][1],
                  "top": s["top"], "base": s["base"], "trails": s["trails"], "lifts": s["lifts"],
                  "zones": bool(r["parks"] or any(t["slow"] for t in r["trails"])), "bytes": size,
                  "checked": bool(r["sources"].get("ratings")),
                  **({"coarse": True} if r["sources"].get("terrainRes", 1) >= 30 else {})})
# resorts kept in R2 (public/data/r2.json) and not downloaded here keep their existing entry
r2 = json.load(open(f"{out}/r2.json"))["ids"] if os.path.exists(f"{out}/r2.json") else []
have = {r["id"] for r in index}
old = json.load(open(f"{out}/index.json")) if os.path.exists(f"{out}/index.json") else []
index += [r for r in old if r["id"] in r2 and r["id"] not in have]
index.sort(key=lambda r: r["id"])
json.dump(index, open(f"{out}/index.json", "w"), indent=1)
print([(r["id"], r["trails"], r["lifts"], r["bytes"]) for r in index])
