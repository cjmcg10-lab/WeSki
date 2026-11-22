#!/usr/bin/env python3
"""List the ski resorts the automatic builder can work through, from OpenSkiMap (no AI, no hand picking).

usage: python3 -I tools/bulk/candidates.py [--areas ski_areas.geojson] [--lifts lifts.geojson] [--min-runs 10] [--min-lifts 2] [--out FILE]

Run it with `python3 -I`: the downloaded files are untrusted data. Downloads stop at 300 MB. All of our maps must be
on disk first (`node tools/maps_r2.mjs pull --all`); it exits with that message otherwise.

OpenSkiMap (https://openskimap.org, data from OpenStreetMap, ODbL) publishes every ski area in the world as one
GeoJSON file, refreshed daily: tiles.openskimap.org/geojson/ski_areas.geojson (about 21 MB). Without --areas it is
downloaded into $PIPE_WORK (default /tmp/weski-pipe) once a day, as is lifts.geojson (about 120 MB), which says which
OpenSkiMap resort each OpenStreetMap lift belongs to.

Keeps operating downhill areas with at least --min-runs downhill runs and --min-lifts lifts, and writes
tools/bulk/candidates.json: one entry per resort with a stable id, OpenSkiMap id, name, country and region, a centre
point and box, the OpenStreetMap outline it comes from, skimap.org id, website, run and lift counts, the share of runs
with a rating (a run with no or an unknown difficulty counts as unrated), and `built` (our resort id) when one of our
mountains already covers it.

The order is the build order: USA and Canada first (the owner's market), then the Alps, Japan, the rest; within a
group the biggest resorts first.

Starting from OpenSkiMap's own entries, never from a name we type, avoids picking a neighbour: matching Deer Valley
by name and distance picked Park City in the 2026-11-22 test.
"""
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = "https://tiles.openskimap.org/geojson/{}.geojson"
UA = {"User-Agent": "weski-build"}
MAX_DOWNLOAD = 300 << 20
KNOWN_RATINGS = {"novice", "easy", "intermediate", "advanced", "expert", "freeride", "extreme"}
GROUPS = [["US", "CA"], ["CH", "AT", "FR", "IT", "DE", "SI", "LI", "AD"], ["JP"], ["NO", "SE", "FI"], ["NZ", "AU", "CL", "AR"]]
STOP = {"ski", "resort", "area", "mountain", "mount", "mt", "the", "and", "de", "du", "des", "la", "le", "les", "station"}


def args():
    a, opt = sys.argv[1:], {"areas": None, "lifts": None, "min_runs": 10, "min_lifts": 2, "out": f"{ROOT}/tools/bulk/candidates.json"}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-").replace("-", "_")
        if k not in opt or i + 1 >= len(a):
            raise SystemExit(__doc__)
        try:
            opt[k] = a[i + 1] if k in ("areas", "lifts", "out") else int(a[i + 1])
        except ValueError:
            raise SystemExit(f"--{k.replace('_', '-')} needs a whole number, got {a[i + 1]!r}")
        i += 2
    return opt


def osd_file(name, path=None):
    """OpenSkiMap's ski_areas or lifts file: the given path, or a copy in the work folder at most a day old."""
    if path:
        return path
    work = os.environ.get("PIPE_WORK", "/tmp/weski-pipe")
    os.makedirs(work, exist_ok=True)
    f = f"{work}/{name}.geojson"
    if not os.path.exists(f) or time.time() - os.path.getmtime(f) > 86400:
        print(f"downloading {URL.format(name)}")
        got = 0
        try:
            with urllib.request.urlopen(urllib.request.Request(URL.format(name), headers=UA), timeout=600) as r, open(f + ".part", "wb") as o:
                while chunk := r.read(1 << 20):
                    got += len(chunk)
                    if got > MAX_DOWNLOAD:
                        raise SystemExit(f"{URL.format(name)} is larger than {MAX_DOWNLOAD >> 20} MB: stopped")
                    o.write(chunk)
        except BaseException:
            if os.path.exists(f + ".part"):
                os.remove(f + ".part")
            raise
        os.replace(f + ".part", f)
    return f


def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(ski|resort|area|skigebiet|station|domaine skiable)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-")


def bounds(geom):
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                walk(x)
    walk(geom["coordinates"])
    return [min(xs), min(ys), max(xs), max(ys)]


def built_resorts():
    """Our built resorts: id -> (name, centre). Every map must be on disk (they live in R2, not git)."""
    idx = {r["id"]: r for r in json.load(open(f"{ROOT}/public/data/index.json"))}
    ours = {rid: (r["name"], (r["lon"], r["lat"])) for rid, r in idx.items() if os.path.exists(f"{ROOT}/tools/resorts/{rid}.json")}
    missing = [rid for rid in ours if not os.path.exists(f"{ROOT}/public/data/{rid}/resort.json")]
    if missing:
        raise SystemExit(f"Maps missing ({len(missing)} of {len(ours)}): run `node tools/maps_r2.mjs pull --all` first")
    return ours


def words(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {w for w in re.split(r"[^a-z0-9]+", s) if w and w not in STOP}


def km(a, b):
    return math.hypot((a[0] - b[0]) * math.cos(math.radians(a[1])), a[1] - b[1]) * 111.32


def mark_built(rows, ours, lifts_path):
    """A resort counts as built when more than half of its lifts that have an OpenStreetMap id (OpenSkiMap's lift
    file) are on one of our maps. Lifts without an id (our `extra_lifts`, drawn by hand) are not counted on either
    side. Exact for linked areas (Cervinia is in our Zermatt map) and for neighbours (Mad River Glen is not in our
    Sugarbush map, though it sits inside its download box). Name and distance never set `built`; they only print a
    review line."""
    ours_lifts = {}
    for rid in ours:
        for l in json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))["lifts"]:
            if l.get("osm"):
                ours_lifts[f"way/{l['osm']}"] = rid
    per_area = {}
    for f in json.load(open(lifts_path))["features"]:
        q = f["properties"]
        osm = next((s["id"] for s in q.get("sources") or [] if s.get("type") == "openstreetmap"), None)
        if not osm:
            continue
        for a in q.get("skiAreas") or []:
            per_area.setdefault(a["properties"]["id"], []).append(osm)
    for r in rows:
        ids = per_area.get(r["osd"], [])
        hits = {}
        for osm in ids:
            if osm in ours_lifts:
                hits[ours_lifts[osm]] = hits.get(ours_lifts[osm], 0) + 1
        if hits:
            rid, n = max(hits.items(), key=lambda x: x[1])
            if n > len(ids) / 2:
                r["built"] = rid
    claimed = {r["built"] for r in rows if r["built"]}
    for rid, (name, c) in ours.items():
        if rid in claimed:
            continue
        mine = words(name)
        for r in rows:
            d = km(c, (r["lon"], r["lat"]))
            if d < 15 and mine & words(r["name"]) and not r["built"]:
                print(f"review: {r['id']} ({r['name']}) may be {rid} (name match, {d:.0f} km)")


def stable_ids(rows):
    """Slug from the name; every member of a name collision gets the region (or country), and any that still collide
    get a short OpenSkiMap id suffix. Independent of file order."""
    def collisions(rs):
        g = {}
        for r in rs:
            g.setdefault(r["id"], []).append(r)
        return [m for m in g.values() if len(m) > 1]
    for r in rows:
        r["id"] = slug(r["name"]) or "resort"
    for g in collisions(rows):
        for r in g:
            r["id"] = f"{r['id']}-{slug(r['region']) or r['cc'].lower()}"
    for g in collisions(rows):
        for r in g:
            r["id"] = f"{r['id']}-{r['osd'][:6]}"


def main():
    opt = args()
    ours = built_resorts()
    F = json.load(open(osd_file("ski_areas", opt["areas"])))["features"]
    rows = []
    for f in F:
        q = f["properties"]
        if "downhill" not in (q.get("activities") or []) or q.get("status") not in (None, "operating") or not q.get("name"):
            continue
        st = q.get("statistics") or {}
        bd = ((st.get("runs") or {}).get("byActivity") or {}).get("downhill", {}).get("byDifficulty") or {}
        runs = sum(v.get("count", 0) for v in bd.values())
        rated = sum(v.get("count", 0) for k, v in bd.items() if k in KNOWN_RATINGS)
        lifts = sum(v.get("count", 0) for v in ((st.get("lifts") or {}).get("byType") or {}).values())
        if runs < opt["min_runs"] or lifts < opt["min_lifts"]:
            continue
        place = (q.get("places") or [{}])[0]
        cc = place.get("iso3166_1Alpha2") or "XX"
        region = ((place.get("localized") or {}).get("en") or {}).get("region") or ""
        lon, lat = (q.get("viewportHint") or {}).get("center") or [None, None]
        box = bounds(f["geometry"]) if f.get("geometry") else None
        if lon is None and box:
            lon, lat = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        if lon is None:
            continue
        src = {s["type"]: s["id"] for s in q.get("sources") or []}
        elev = [st.get("minElevation"), st.get("maxElevation")]
        rows.append({
            "id": None, "osd": q["id"], "name": q["name"], "cc": cc, "region": region,
            "lon": round(lon, 5), "lat": round(lat, 5), "box": [round(v, 5) for v in box] if box else None,
            "osm": src.get("openstreetmap"), "skimap": src.get("skimap.org"), "web": (q.get("websites") or [None])[0],
            "runs": runs, "lifts": lifts, "rated": round(rated / runs, 3),
            "vert": round(elev[1] - elev[0]) if None not in elev else None, "convention": q.get("runConvention"),
            "built": None,
        })
    stable_ids(rows)
    mark_built(rows, ours, osd_file("lifts", opt["lifts"]))
    rank = {c: g for g, cs in enumerate(GROUPS) for c in cs}
    rows.sort(key=lambda r: (rank.get(r["cc"], len(GROUPS)), -(r["lifts"] * 3 + r["runs"]), r["id"]))
    with open(opt["out"], "w") as o:
        o.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
    todo = [r for r in rows if not r["built"]]
    by = {}
    for r in todo:
        by[r["cc"]] = by.get(r["cc"], 0) + 1
    print(f"{len(rows)} resorts ({len(rows) - len(todo)} already built, {len(todo)} to build) -> {opt['out']}")
    print("to build by country:", ", ".join(f"{c} {n}" for c, n in sorted(by.items(), key=lambda x: -x[1])[:15]))


if __name__ == "__main__":
    main()
