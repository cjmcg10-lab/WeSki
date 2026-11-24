#!/usr/bin/env python3
"""Write resort configs automatically from the candidate list (issue #45, phase 2). No AI, no hand edits.

usage: python3 -I tools/bulk/autoconfig.py (--next N | <candidate id> ...) [--lifts lifts.geojson] [--force]

Reads tools/bulk/candidates.json (tools/bulk/candidates.py) and OpenSkiMap's lifts.geojson (in $PIPE_WORK, or
--lifts), and writes tools/resorts/<id>.json for each resort:

  id, name, region          from OpenSkiMap ("Colorado, USA", "British Columbia, Canada")
  tz                        from the coordinates (timezonefinder)
  osm_bbox                  OpenSkiMap's box of the area joined with its lifts, plus 300 m (tools/pipeline.py widens
                            it until nothing joined to the resort reaches the edge)
  area_osm                  the OpenStreetMap outline OpenSkiMap built the area from ("way/123" or "relation/456");
                            tools/pipeline.py reads its name from the download and sets area_name
  include_ways              the OpenStreetMap ids of the area's lifts as OpenSkiMap assigns them: the seed of the
                            whole-resort search when there is no readable outline, and a guard against losing a lift
  dem                       terrain source by country: USA automatic (USGS 1 m, 10 m filler), Canada NRCan HRDEM 1 m
                            with MRDEM 30 m filler, Switzerland swisstopo, France IGN, Japan GSI, elsewhere
                            Copernicus GLO-30 (tools/fetch_dem.py)
  ratings_feed              a resort feed with a trail list, where one is known (mtnpowder ids, CLAUDE.md)
  openskimap                OpenSkiMap's id and run and lift counts, kept for the quality gate (tools/bulk/gate.py)
  auto                      true: built by rule; build_data.py applies the rule-based lift-end joins

--next N takes the first N candidates in build order that are not built and have no config yet. A candidate whose
id is already used by a config is skipped unless --force (ids are checked to be unique in the candidate list too).
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.environ.get("PIPE_WORK", "/tmp/weski-pipe")
COUNTRY = {"US": "USA", "CA": "Canada", "CH": "Switzerland", "AT": "Austria", "FR": "France", "IT": "Italy",
           "DE": "Germany", "JP": "Japan", "NO": "Norway", "SE": "Sweden", "FI": "Finland", "AD": "Andorra",
           "SI": "Slovenia", "LI": "Liechtenstein", "ES": "Spain", "CZ": "Czechia", "PL": "Poland", "SK": "Slovakia",
           "NZ": "New Zealand", "AU": "Australia", "CL": "Chile", "AR": "Argentina", "KR": "South Korea", "CN": "China"}
DEM = {"CA": {"source": "canada"}, "CH": {"source": "swiss"}, "FR": {"source": "ign"}, "JP": {"source": "gsi"}}
# resort feeds that still returned a trail list when last checked (CLAUDE.md, 2026-11-21), by candidate id
FEEDS = {"mont-tremblant-mont-tremblant": 4, "blue-mountain-ontario": 3, "june-mountain": 59, "bear-mountain": 57,
         "snow-summit": 58, "lake-louise": 74, "mt-norquay": 75, "banff-sunshine-village": 76,
         "revelstoke-mountain": 77, "taos-valley": 78, "brighton": 66, "eldora": 56, "aspen-snowmass": 51,
         "aspen-mountain": 52, "aspen-highlands": 53, "buttermilk": 54, "snoqualmie": 79}


def pad(b, m):
    dy = m / 111320
    dx = m / (111320 * math.cos(math.radians((b[1] + b[3]) / 2)))
    return [round(b[0] - dx, 4), round(b[1] - dy, 4), round(b[2] + dx, 4), round(b[3] + dy, 4)]


def short_name(name):
    """"Snowbasin Resort" -> "Snowbasin", "Whitefish Mountain Resort" -> "Whitefish Mountain" (the app's picker
    shows names without the generic word, as for our other mountains); a name that would be empty is kept."""
    import re
    s = re.sub(r"\s+(Ski\s+(Resort|Area)|Resort)(?=\s*(\(|$))", "", name).strip()
    return s if len(s) >= 3 else name


def lifts_by_area(path):
    """OpenSkiMap area id -> list of (OpenStreetMap way id, [lon, lat] points) of its lifts."""
    out = {}
    for f in json.load(open(path))["features"]:
        q = f["properties"]
        osm = next((s["id"] for s in q.get("sources") or [] if s.get("type") == "openstreetmap"), None)
        if not osm or not osm.startswith("way/") or q.get("status") not in (None, "operating"):
            continue
        g = f.get("geometry") or {}
        pts = g.get("coordinates") or []
        if g.get("type") == "MultiLineString":
            pts = [p for part in pts for p in part]
        if g.get("type") not in ("LineString", "MultiLineString"):
            pts = []
        for a in q.get("skiAreas") or []:
            out.setdefault(a["properties"]["id"], []).append((int(osm[4:]), pts))
    return out


def main():
    a = sys.argv[1:]
    opt = {"lifts": os.path.join(WORK, "lifts.geojson"), "next": 0, "force": False}
    ids = []
    i = 0
    while i < len(a):
        if a[i] == "--lifts":
            opt["lifts"] = a[i + 1]; i += 1
        elif a[i] == "--next":
            opt["next"] = int(a[i + 1]); i += 1
        elif a[i] == "--force":
            opt["force"] = True
        elif a[i].startswith("-"):
            raise SystemExit(__doc__)
        else:
            ids.append(a[i])
        i += 1
    if not ids and not opt["next"]:
        raise SystemExit(__doc__)
    rows = json.load(open(f"{ROOT}/tools/bulk/candidates.json"))
    seen = {}
    for r in rows:
        seen[r["id"]] = seen.get(r["id"], 0) + 1
    dup = [k for k, n in seen.items() if n > 1]
    if dup:
        raise SystemExit(f"candidate ids are not unique: {', '.join(dup[:10])}")
    by_id = {r["id"]: r for r in rows}
    have = {f[:-5] for f in os.listdir(f"{ROOT}/tools/resorts") if f.endswith(".json")}
    if opt["next"]:
        ids = [r["id"] for r in rows if not r["built"] and r["id"] not in have][:opt["next"]]
    from timezonefinder import TimezoneFinder
    tzf = TimezoneFinder()
    lifts = lifts_by_area(opt["lifts"])
    for rid in ids:
        r = by_id.get(rid)
        if not r:
            print(f"{rid}: not in the candidate list"); continue
        path = f"{ROOT}/tools/resorts/{rid}.json"
        if rid in have and not opt["force"]:
            print(f"{rid}: a config already exists, skipped"); continue
        if r["built"]:
            print(f"{rid}: already on our map {r['built']}, skipped"); continue
        own = lifts.get(r["osd"], [])
        pts = [p for _, ps in own for p in ps]
        box = list(r["box"]) if r.get("box") else [r["lon"], r["lat"], r["lon"], r["lat"]]
        if pts:
            box = [min(box[0], min(p[0] for p in pts)), min(box[1], min(p[1] for p in pts)),
                   max(box[2], max(p[0] for p in pts)), max(box[3], max(p[1] for p in pts))]
        country = COUNTRY.get(r["cc"], r["cc"])
        cfg = {"id": rid, "name": short_name(r["name"]), "region": f"{r['region']}, {country}" if r["region"] else country,
               "tz": tzf.timezone_at(lng=r["lon"], lat=r["lat"]) or "UTC", "auto": True}
        if r.get("osm") and r["osm"].split("/")[0] in ("way", "relation"):
            cfg["area_osm"] = r["osm"]
        if own:
            cfg["include_ways"] = sorted({w for w, _ in own})
        cfg["osm_bbox"] = pad(box, 300)
        if r["cc"] != "US":
            cfg["dem"] = DEM.get(r["cc"], {"source": "copernicus"})
        if rid in FEEDS:
            cfg["ratings_feed"] = {"mtnpowder": FEEDS[rid]}
        cfg["openskimap"] = {"id": r["osd"], "cc": r["cc"], "runs": r["runs"], "lifts": r["lifts"], "rated": r["rated"],
                             "skimap": r.get("skimap"), "web": r.get("web")}
        json.dump(cfg, open(path, "w"), indent=1, ensure_ascii=False)
        open(path, "a").write("\n")
        print(f"{rid}: {r['name']} ({cfg['region']}), {len(own)} lifts from OpenSkiMap, outline {r.get('osm')}"
              + (f", feed mtnpowder {FEEDS[rid]}" if rid in FEEDS else ""))


if __name__ == "__main__":
    main()
