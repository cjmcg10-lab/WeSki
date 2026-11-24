#!/usr/bin/env python3
"""Build or rebuild one or more resorts with one command, then print a score card for each.

usage: python3 tools/pipeline.py <id> [<id> ...] [options]

  --work DIR        where downloads and logs go (default $PIPE_WORK or /tmp/weski-pipe); reused between runs
  --fresh-osm       download the OpenStreetMap extract again even if one is in the work folder
  --terrain         download the terrain again (default for an existing resort: rebuild it from the built map)
  --checks-only     skip the build, only run the checks and write the score card
  --no-index        do not rebuild index.json and globe at the end
  --no-cards        do not make the mountain cards (the app's picture of each mountain) at the end
  --r2              upload the rebuilt map to Cloudflare R2 (tools/maps_r2.mjs push), which the LIVE app reads,
                    and keep its files there rather than in git. Without it nothing is uploaded, not even for a
                    resort already listed in public/data/r2.json (such a resort is downloaded first if it is not on
                    disk); show a rebuild on the preview with tools/preview/deploy.mjs, push it once approved

Steps, in the order docs/MOUNTAIN_CHECKLIST.md asks for:
  1. OpenStreetMap extract for the config's osm_bbox (tools/dev/osmget.py)
  2. terrain: USA  -> USGS 1 m LiDAR, found with the National Map API and read straight from the
                      cloud tiles (only the resort's window is downloaded, tools/fetch_dem.py cog)
              else -> the config's "dem": {"source": "swiss"|"ign"|"gsi"} or
                      {"source": "cog", "epsg": 3035, "urls": [...]} (tools/fetch_dem.py)
              an existing resort without --terrain -> tools/dem_from_built.py (exact, no download)
  3. official ratings: if tools/official/<id>.json is missing and the config names a feed
     ("ratings_feed": {"mtnpowder": 60}), fetch it; otherwise the card says the ratings are NOT checked
  4. build_data, build_extras, build_zones, verify_exists, build_canopy (real trees), build_landcover (forest, fields, lakes round the map), enrich_osm (lift and
     building details)
  5. checks: official_ratings check, audit --list, check_downhill
  6. score card: tools/cards/<id>.md (committed: it is the record of the mountain's state) and a
     line in the summary table printed at the end. Full logs stay in the work folder.
After all resorts: build_index and build_globe, then the mountain cards (tools/mountain_cards.mjs: the picture of
each mountain in the app, made from its 3D map; needs Chromium, PW_CHROMIUM=/opt/pw-browsers/chromium in a cloud
session). A mountain whose card could not be made gets a LOOK line on its score card; tests/cards.test.js fails
until it has one.

The card only lists what needs a person: everything else is a one-line pass.
"""
import datetime
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
UA = {"User-Agent": "weski-build"}


def args():
    a = sys.argv[1:]
    opt = {"work": os.environ.get("PIPE_WORK", "/tmp/weski-pipe"), "fresh_osm": False, "terrain": False,
           "checks_only": False, "index": True, "r2": False, "cards": True}
    ids = []
    i = 0
    while i < len(a):
        x = a[i]
        if x == "--work":
            opt["work"] = a[i + 1]; i += 1
        elif x == "--fresh-osm":
            opt["fresh_osm"] = True
        elif x == "--terrain":
            opt["terrain"] = True
        elif x == "--checks-only":
            opt["checks_only"] = True
        elif x == "--no-index":
            opt["index"] = False
        elif x == "--no-cards":
            opt["cards"] = False
        elif x == "--r2":
            opt["r2"] = True
        elif x.startswith("-"):
            raise SystemExit(__doc__)
        else:
            ids.append(x)
        i += 1
    if not ids:
        raise SystemExit(__doc__)
    return ids, opt


def run(cmd, log, ok_codes=(0,)):
    """Run a step, append its output to the log, return the output. Stops the resort on failure."""
    t = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = p.stdout + p.stderr
    with open(log, "a") as f:
        f.write(f"\n$ {' '.join(cmd)}\n{out}")
    name = os.path.basename(cmd[1]) if cmd[0] in (PY, "node") else cmd[0]
    print(f"   {name:22s} {time.time() - t:6.1f} s" + ("" if p.returncode in ok_codes else "  FAILED"))
    if p.returncode not in ok_codes:
        tail = "\n".join(out.strip().splitlines()[-6:])
        raise StepFailed(f"{name} failed:\n{tail}")
    return out


class StepFailed(Exception):
    pass


# ---------- bounding box and terrain ----------

def built_bbox(rid):
    """Corners of an existing build, for configs written before osm_bbox was required."""
    R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
    P, G = R["proj"], R["grid"]
    W, H = (G["nx"] - 1) * G["cell"], (G["ny"] - 1) * G["cell"]

    def lonlat(x, y):
        a, b = x - P["xm"], y - P["ym"]
        v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
        return P["lon0"] + sum(c * q for c, q in zip(P["clon"], v)), P["lat0"] + sum(c * q for c, q in zip(P["clat"], v))
    pts = [lonlat(x, y) for x in (0, W) for y in (0, H)]
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def pad(b, m):
    dy = m / 111320
    dx = m / (111320 * math.cos(math.radians((b[1] + b[3]) / 2)))
    return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy]


def is_usa(cfg):
    return cfg.get("region", "").endswith("USA")


def tnm_tiles(b, dataset="Digital Elevation Model (DEM) 1 meter"):
    """USGS DEM tiles over a bounding box, grouped by survey project, newest project first."""
    q = urllib.parse.urlencode({"datasets": dataset, "prodFormats": "GeoTIFF",
                                "bbox": ",".join(f"{v:.5f}" for v in b), "max": 200})
    url = "https://tnmaccess.nationalmap.gov/api/v1/products?" + q
    for k in range(4):
        try:
            items = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())["items"]
            break
        except Exception:
            if k == 3:
                raise
            time.sleep(5 * (k + 1))
    groups = {}
    for it in items:
        # "USGS 1 Meter 18 x67y459 CT_Statewide_C16" -> project CT_Statewide_C16
        # older titles: "USGS one meter x73y434 CA NoCAL Wildfires B1 2018"
        m = re.match(r"USGS 1 Meter (\d+) x\d+y\d+ (.+)", it["title"])
        old = re.match(r"USGS one meter x\d+y\d+ (.+)", it["title"], re.I)
        proj = m.group(2) if m else old.group(1) if old else it["title"]
        g = groups.setdefault(proj, {"project": proj, "date": "", "tiles": []})
        g["date"] = max(g["date"], it.get("publicationDate") or "")
        bb = it["boundingBox"]
        g["tiles"].append({"url": it["downloadURL"], "zone": int(m.group(1)) if m else None,
                           "bb": [bb["minX"], bb["minY"], bb["maxX"], bb["maxY"]]})
    return sorted(groups.values(), key=lambda g: g["date"], reverse=True)


def coverage(tiles, b, n=24):
    inside = 0
    for i in range(n):
        for j in range(n):
            x = b[0] + (b[2] - b[0]) * (i + 0.5) / n
            y = b[1] + (b[3] - b[1]) * (j + 0.5) / n
            inside += any(t["bb"][0] <= x <= t["bb"][2] and t["bb"][1] <= y <= t["bb"][3] for t in tiles)
    return inside / (n * n)


def terrain_usa(b, out, log):
    groups = [g for g in tnm_tiles(b)]
    # the 10 m national model (1/3 arc-second) always comes last, to fill whatever the 1 m surveys leave empty
    # (a survey's tiles can claim the area and still be mostly empty, as at Crystal Mountain)
    if True:
        coarse = tnm_tiles(b, "National Elevation Dataset (NED) 1/3 arc-second Current")
        if coarse:  # one 1x1 degree tile per group: put them together as one source
            groups.append({"project": "10 m national elevation model (1/3 arc-second)", "date": "",
                           "tiles": [t for g in coarse for t in g["tiles"]]})
    if not groups:
        raise StepFailed("no USGS terrain found for this area: give the config a \"dem\" source")
    # the newest survey that covers the whole area on its own; otherwise newest first, the rest filling gaps
    # (tiles of one survey can be partly empty, so the other surveys always follow as gap fillers)
    full = [g for g in groups if g["date"] and coverage(g["tiles"], b) >= 0.999]
    use = ([full[0]] + [g for g in groups if g is not full[0]]) if full else groups
    urls = [t["url"] for g in use for t in g["tiles"]]
    zone = (use[0]["tiles"][0]["zone"] or int((b[0] + b[2]) / 2 + 180) // 6 + 1)
    with open(log, "a") as f:
        f.write("\nterrain surveys: " + ", ".join(f"{g['project']} ({g['date']}, {len(g['tiles'])} tiles, "
                                                  f"{coverage(g['tiles'], b) * 100:.0f}% cover)" for g in groups) + "\n")
    run([PY, "tools/fetch_dem.py", "cog", out, *map(str, b), str(26900 + zone), *urls], log)
    return use[0]["project"] + (f" (gaps filled from {', '.join(g['project'] for g in use[1:])})" if len(use) > 1 else "")


def whole_resort(rid, cfg, bbox, osm, opt, log, notes):
    """Download OpenStreetMap around the resort, widening the box until nothing joined to the resort reaches its
    edge (tools/extent.py), and until every lift on the resort's own list (official json "lifts") is found:
    a lift the map lacks is looked for 6 km around and, when found, it and everything joined to it are added
    (config "include_ways"). Returns True when the config's osm_bbox had to grow (the card says what was added)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import extent
    from official_ratings import missing_lifts
    side = osm + ".box"
    have = json.load(open(side)) if os.path.exists(osm) and os.path.exists(side) and not opt["fresh_osm"] else None

    def fetch(b, path=osm):
        span = max(b[2] - b[0], b[3] - b[1])
        run([PY, "tools/dev/osmget.py", path, *map(str, b), str(max(2, math.ceil(span / 0.04)))], log)
        if path == osm:
            json.dump(b, open(side, "w"))
        return b

    def union(p, q):
        return [min(p[0], q[0]), min(p[1], q[1]), max(p[2], q[2]), max(p[3], q[3])]

    def grow(have):
        for _ in range(6):
            got = extent.check(osm, cfg)
            need = got["bbox"]
            if not need:
                return have, got
            inner = pad(have, -300)
            if inner[0] <= need[0] and inner[1] <= need[1] and inner[2] >= need[2] and inner[3] >= need[3]:
                return have, got
            have = fetch(pad(union(have, need), 1500))
        notes.append("the resort kept growing after six wider downloads: check its extent by hand")
        return have, got

    if have is None:
        have = fetch(pad(bbox, 1500))  # a margin beyond the box, to see what continues past it
    resolve_outline(rid, cfg, osm, notes)
    have, got = grow(have)
    offp = f"{ROOT}/tools/official/{rid}.json"
    offj = json.load(open(offp)) if os.path.exists(offp) else {}
    listed = [n for n in offj.get("lifts", []) if n not in offj.get("lifts_explained", {})]
    found_far = []
    if listed and got["bbox"]:
        feats, _ = extent.load(osm)
        kept = [f["name"] for f in feats if f["lift"] and f["id"] in got["keep"] and f["name"]]
        miss = missing_lifts(listed, kept)
        if miss:
            wide = osm[:-4] + ".wide.osm"
            fetch(pad(have, 6000), wide)
            wf, _ = extent.load(wide)
            far = [f for f in wf if f["lift"] and f["name"] and f["id"] not in got["keep"]
                   and missing_lifts(miss, [f["name"]]) != miss]
            if far:
                cfg["include_ways"] = sorted(set(cfg.get("include_ways", [])) | {f["id"] for f in far})
                found_far = sorted({f["name"] for f in far})
                pts = [p for f in far for p in f["pts"]]
                have = fetch(pad(union(have, [min(p[0] for p in pts), min(p[1] for p in pts),
                                              max(p[0] for p in pts), max(p[1] for p in pts)]), 1500))
                have, got = grow(have)
    need = got["bbox"]
    if not need:
        return False
    old = cfg.get("osm_bbox") or bbox
    # the box grows only when part of the resort lies outside it (not merely the margin around it)
    raw = extent.extent(extent.load(osm)[0], got["keep"], margin_m=0)
    bigger = raw[0] < old[0] or raw[1] < old[1] or raw[2] > old[2] or raw[3] > old[3]
    if not (bigger or found_far):
        return False
    new = union(old, need)
    path = f"{ROOT}/tools/resorts/{rid}.json"
    disk = json.load(open(path))
    if disk.get("area_bbox") == old:
        disk["area_bbox"] = cfg["area_bbox"] = new
    disk["osm_bbox"] = cfg["osm_bbox"] = new
    if found_far:
        disk["include_ways"] = cfg["include_ways"]
    json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
    open(path, "a").write("\n")
    subprocess.run([PY, "tools/dev/fmt_config.py", path], cwd=ROOT, capture_output=True)
    before_lifts = set((snapshot(rid) or {}).get("lift_names", []))
    lifts = sorted(set(n for n in got["added_lifts"] + found_far if n not in before_lifts))
    notes.append(f"FOUND MORE: the resort reaches beyond its download box; the box was widened from {old} to {new}"
                 + (f"; lifts added: {', '.join(lifts)}" if lifts else ""))
    return bigger


def resolve_outline(rid, cfg, osm, notes):
    """Automatic configs name the resort's OpenStreetMap outline by id (area_osm, from OpenSkiMap): read its name from
    the download and set area_name, which the build and the whole-resort search use. An outline with no name, or one
    not in the download, leaves the config as it is (the search then starts from the resort's lifts, include_ways)."""
    if not cfg.get("area_osm") or cfg.get("area_name"):
        return
    import xml.etree.ElementTree as ET
    kind, oid = cfg["area_osm"].split("/")
    name, access = None, None
    for ev, el in ET.iterparse(osm):
        if el.tag == kind and el.get("id") == oid:
            t = {x.get("k"): x.get("v") for x in el.findall("tag")}
            if t.get("landuse") == "winter_sports" and t.get("name"):
                name = t["name"]
            access = t.get("access")
            break
        if el.tag in ("way", "relation"):
            el.clear()
    if not name:
        notes.append(f"the resort's outline {cfg['area_osm']} has no name or is not in the download: the build starts "
                     "from the resort's lifts instead (include_ways)")
        return
    path = f"{ROOT}/tools/resorts/{rid}.json"
    disk = json.load(open(path))
    disk["area_name"] = cfg["area_name"] = name
    disk["area_buffer"] = cfg["area_buffer"] = 300
    if access:   # the quality gate holds a private club (access=private)
        disk["area_access"] = cfg["area_access"] = access
    json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
    open(path, "a").write("\n")


TERRAIN_NAMES = {"1m": "1 m lidar", "10m": "10 m national model", "30m": "30 m", "other": "other"}


def terrain_shares(out):
    """The "share <source> <percent>" lines tools/fetch_dem.py prints: how much of the area each source filled."""
    sh = {}
    for m in re.finditer(r"^share (\S+) ([\d.]+)$", out, re.M):
        sh[m.group(1)] = sh.get(m.group(1), 0) + float(m.group(2))
    tot = sum(sh.values()) or 1
    return {k: round(v / tot * 100, 1) for k, v in sh.items()}


def record_terrain(rid, cfg, label, shares):
    """Automatic configs: write the terrain source, its shares and its resolution into the config, so the app's
    credits name it and the app can say when the terrain is coarse (30 m)."""
    if not cfg.get("auto"):
        return
    fine = shares.get("1m", 0) + shares.get("other", 0) * (cfg.get("dem", {}).get("source") in ("swiss", "ign", "gsi"))
    res = 1 if fine >= 80 else 10 if fine + shares.get("10m", 0) >= 80 else 30
    parts = ", ".join(f"{TERRAIN_NAMES.get(k, k)} {v:.0f}%" for k, v in sorted(shares.items(), key=lambda x: -x[1]))
    path = f"{ROOT}/tools/resorts/{rid}.json"
    disk = json.load(open(path))
    disk["terrain_source"] = cfg["terrain_source"] = label + (f" ({parts})" if parts else "")
    disk["terrain_res"] = cfg["terrain_res"] = res
    disk["terrain_shares"] = cfg["terrain_shares"] = shares
    json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
    open(path, "a").write("\n")


SOURCE_LABEL = {"canada": "NRCan HRDEM 1 m lidar mosaic, gaps from MRDEM 30 m (Open Government Licence - Canada)",
                "copernicus": "Copernicus DEM GLO-30, 30 m (produced using Copernicus WorldDEM-30, DLR e.V. and Airbus, "
                              "provided under COPERNICUS by the European Union and ESA)",
                "swiss": "swisstopo swissALTI3D 2 m", "ign": "IGN RGE ALTI 1 m", "gsi": "GSI Japan 5 m DEM"}


def terrain(rid, cfg, bbox, out, opt, log):
    if os.path.exists(out) and not opt["terrain"]:
        return "reused from the work folder"
    built = os.path.exists(f"{ROOT}/public/data/{rid}/resort.json")
    if built and not opt["terrain"]:
        d = cfg.get("dem")
        epsg = [str(d["epsg"])] if isinstance(d, dict) and d.get("epsg") else []  # else found from the grid
        run([PY, "tools/dem_from_built.py", f"public/data/{rid}", out, *epsg], log)
        return "rebuilt from the existing map (no download)"
    b = pad(bbox, 1500)  # build_data adds its own margin around everything in the extract
    if is_usa(cfg) and not cfg.get("dem"):
        note = "USGS " + terrain_usa(b, out, log)
        record_terrain(rid, cfg, "USGS 3DEP elevation (public domain)", terrain_shares(open(log).read().rsplit("tools/fetch_dem.py", 1)[-1]))
        return note
    d = cfg.get("dem")
    if isinstance(d, list):  # older form: [source, west, south, east, north]
        d, b = {"source": d[0]}, [float(v) for v in d[1:5]]
    if not d:
        raise StepFailed("no terrain source: add \"dem\" to the config (see tools/pipeline.py)")
    if d["source"] == "cog":
        got = run([PY, "tools/fetch_dem.py", "cog", out, *map(str, b), str(d["epsg"]), *d["urls"]], log)
    else:
        got = run([PY, "tools/fetch_dem.py", d["source"], out, *map(str, b)], log)
    record_terrain(rid, cfg, SOURCE_LABEL.get(d["source"], d["source"]), terrain_shares(got) or {"other": 100.0})
    return d["source"]


# ---------- score card ----------

def snapshot(rid):
    p = f"{ROOT}/public/data/{rid}/resort.json"
    if not os.path.exists(p):
        return None
    R = json.load(open(p))
    shown = [t for t in R["trails"] if not t.get("hide")]
    return {"runs": len(shown), "named": len({t["name"] for t in shown if t.get("name")}),
            "lifts": len([l for l in R["lifts"] if not l.get("hide")]),
            "km": round(sum(t.get("len", 0) for t in shown) / 1000, 1),
            "lift_names": sorted(l["name"] for l in R["lifts"] if l.get("name"))}


def lift_ends_stuck(R):
    """Lift ends the routing cannot reach from, or get back to, the best-connected lift end (as tests/resorts.test.js checks)."""
    g = R.get("graph") or {}
    adj = {}
    for e in g.get("edges", []):
        adj.setdefault(e["a"], []).append(e["b"])
        if e.get("bi"):
            adj.setdefault(e["b"], []).append(e["a"])

    def reach(s):
        seen, st = {s}, [s]
        while st:
            for v in adj.get(st.pop(), []):
                if v not in seen:
                    seen.add(v)
                    st.append(v)
        return seen
    skip = {R["lifts"][i]["name"] for i in R.get("isolated", [])} | {l["name"] for l in R["lifts"] if l.get("hide")}
    ends = [p for p in R["pois"] if p["kind"] in ("lift", "lifttop") and p["name"].rsplit(" (", 1)[0] not in skip]
    if not ends:
        return []
    rs = {p["n"]: reach(p["n"]) for p in ends}
    nodes = {p["n"] for p in ends}
    # the hub: the lift end that the most other ends can both reach and get back from (the largest group joined both
    # ways), so one cut-off lift is reported as such rather than making every other end look stuck
    hub = max(ends, key=lambda p: sum(1 for q in ends if q["n"] in rs[p["n"]] and p["n"] in rs[q["n"]]))["n"]
    flat = [R["lifts"][e["r"]]["name"] + ": does not climb" for e in g.get("edges", [])
            if e["k"] == "l" and not e.get("bi") and g["nodes"][e["b"]][2] <= g["nodes"][e["a"]][2]]
    return flat + [p["name"] + ("" if p["n"] in rs[hub] else ": not reachable") + ("" if hub in rs[p["n"]] else ": no way back")
                   for p in ends if p["n"] not in rs[hub] or hub not in rs[p["n"]]]


TUBING = re.compile(r"tub(e|es|ing)\b|sled|snow ?coaster|luge", re.I)


def isolate_cut_off(rid, R):
    """Automatic configs (issue #45, phase 4): a lift whose ends the routing cannot reach from the rest of the lifts, or
    cannot get back from, after the rule-based joins, is marked isolated with the reason (config isolated_lifts and
    isolated_notes), as a person did by hand for village tows; tubing and sledding lifts always are. Returns the names
    newly marked (the build is then run again). The quality gate holds a map with more than a few such lifts."""
    lines = lift_ends_stuck(R)
    kind = {l["name"]: l.get("kind") for l in R["lifts"]}
    # a village gondola whose bottom no run reaches but whose top is joined: skiers ride it down too (two_way_lifts,
    # as set by hand for Steamboat's and Telluride's gondolas)
    two = sorted({s.split(" (")[0] for s in lines if s.endswith("(base): not reachable")
                  and kind.get(s.split(" (")[0]) in ("gondola", "cable_car", "tram", "mixed_lift")
                  and not any(x.startswith(s.split(" (")[0] + " (top)") for x in lines)})
    path = f"{ROOT}/tools/resorts/{rid}.json"
    disk = json.load(open(path))
    if [n for n in two if n not in disk.get("two_way_lifts", [])]:
        disk["two_way_lifts"] = sorted(set(disk.get("two_way_lifts", [])) | set(two))
        json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
        open(path, "a").write("\n")
        return [f"{n} (rides both ways)" for n in two]
    stuck = {s.split(" (")[0] for s in lines}
    tub = {l["name"] for l in R["lifts"] if l.get("name") and TUBING.search(l["name"])}
    have = set(disk.get("isolated_lifts", []))
    new = sorted(n for n in (stuck | tub) - have if n)
    if not new:
        return []
    disk["isolated_lifts"] = sorted(have | set(new))
    notes = disk.setdefault("isolated_notes", {})
    for n in new:
        notes[n] = "rule: tubing or sledding lift" if n in tub else "rule: not joined to the rest of the lifts on the map"
    json.dump(disk, open(path, "w"), indent=1, ensure_ascii=False)
    open(path, "a").write("\n")
    return new


def card(rid, cfg, logs, before, terrain_note, notes):
    R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
    after = snapshot(rid)
    shown = [t for t in R["trails"] if not t.get("hide")]
    items = []  # (status, title, detail)

    def add(ok, title, detail=""):
        items.append(("pass" if ok is True else "info" if ok is None else "LOOK", title, detail))

    off_path = f"{ROOT}/tools/official/{rid}.json"
    if os.path.exists(off_path):
        chk = logs.get("check", "")
        m = re.search(r"(\d+) official runs, (\d+) matched on the map, (\d+) with a different rating", chk)
        miss = re.search(r"official runs not on the map \((\d+)\): ?(.*)", chk)
        add(True, "ratings checked against the resort's own list",
            f"{m.group(1)} on the list, {m.group(2)} matched, {m.group(3)} corrected from OpenStreetMap" if m else "")
        if miss and int(miss.group(1)):
            add(False, f"{miss.group(1)} runs on the resort's list are not on the map",
                miss.group(2)[:600] + " (draw them, or explain them in the official json: same_as / not_runs / elsewhere)")
        off = json.load(open(off_path))
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from official_ratings import missing_lifts, key, SURFACE_WORDS
        if off.get("lifts"):
            gone = [n for n in missing_lifts(off["lifts"], [l["name"] for l in R["lifts"] if not l.get("hide")])
                    if n not in off.get("lifts_explained", {})]
            big = [n for n in gone if not any(w in n.lower() for w in SURFACE_WORDS)]
            small = [n for n in gone if n not in big]
            add(not big, f"lifts on the resort's list: {len(off['lifts']) - len(gone)} of {len(off['lifts'])} on the map",
                ("MISSING: " + ", ".join(big) + ". A missing chair or gondola usually means a missing area: find it "
                 "before going live (not in OpenStreetMap: extra_lifts; removed by the resort: explain it in the official json "
                 "under lifts_explained)" if big else "") + (f" Small lifts not on the map: {', '.join(small)}" if small else ""))
        else:
            add(False, "no lift list from the resort: put the trail map's lift names in the official json as \"lifts\"",
                "without it a missing chair or area cannot be noticed (map_read.py notes: lines \"Lift: <name>\")")
        if off.get("areas") and miss:
            gone_runs = {key(n) for n in miss.group(2).split(", ")}
            bad = []
            for area, runs in off["areas"].items():
                lost = [r for r in runs if key(r) in gone_runs]
                if len(runs) >= 3 and len(lost) >= 0.5 * len(runs):
                    bad.append(f"{area} ({len(lost)} of {len(runs)} runs missing)")
            add(not bad, f"resort areas mostly missing from the map: {len(bad)}", "; ".join(bad))
    else:
        add(False, "ratings NOT checked: not ready to go live",
            "make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)")

    guess = [t["name"] or "(no name)" for t in shown if t.get("u") and t.get("len", 0) > 100]
    add(not guess, f"{len(guess)} shown runs rated by guess", ", ".join(sorted(set(guess)))[:500])

    m = re.search(r"from the base of (.+?): (\d+)/(\d+) trail segments reachable; not reachable: (.*)", logs.get("build_data", ""))
    if m:
        a, b = int(m.group(2)), int(m.group(3))
        add(a == b, f"reachable from the base: {a} of {b} run pieces", "" if a == b else "not reachable: " + m.group(4)[:500])
    stuck = lift_ends_stuck(R)
    add(not stuck, f"{len(stuck)} lift ends cannot be reached or cannot get back to the rest (the tests fail on this)",
        "; ".join(stuck)[:500] + (" (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no "
                                  "run down: links; a private or club lift: isolated_lifts with a note)" if stuck else ""))

    joins = []
    for key in ("loose run ends joined automatically:", "cut-off runs joined to the nearest reachable point:",
                "dead-end runs joined to the nearest way to a lift:", "lift ends joined by rule:"):
        for line in logs.get("build_data", "").splitlines():
            if line.startswith(key):
                joins += [j.strip() for j in line[len(key):].split(";") if j.strip()]
    if joins:
        add(None, f"{len(joins)} joins made automatically (look at the longest ones on the map)", "; ".join(joins)[:700])

    ve = logs.get("verify", "")
    hidden = [l for l in ve.splitlines() if l.strip().startswith("run hidden:")]
    review = [l for l in ve.splitlines() if l.strip().startswith("lift to review:")]
    if hidden:
        add(None, f"{len(hidden)} run pieces hidden (not on the resort's list and not a link)",
            "; ".join(h.split("run hidden:")[1].strip() for h in hidden)[:500])
    if review and os.path.exists(off_path):  # without the resort's list every lift would be flagged
        # lifts already in the previous build were reviewed by hand when it was made; only new ones need a look
        known = set(before["lift_names"]) if before else set()
        new = [r.split("lift to review:")[1].strip() for r in review]
        fresh = [r for r in new if r.split(" (")[0] not in known]
        if fresh:
            add(False, f"{len(fresh)} new lifts to review (no listed run at the top, or no listed terrain at the bottom)",
                "; ".join(fresh)[:500])
        if len(fresh) < len(new):
            add(None, f"{len(new) - len(fresh)} lifts flagged for review were already on the previous build (checked then)")

    dh = logs.get("downhill_json")
    if dh is not None:
        climb = [r for r in dh if not r.get("flat")]
        add(not climb, f"{len(climb)} runs climb more than 12 m", "; ".join(f"{r['name']} {r['climb']} m" for r in climb)[:500])

    au = logs.get("audit", "").splitlines()
    if len(au) > 1:
        flagged = au[1].strip()
        add(flagged == "nothing flagged" or None, "audit: " + flagged)

    if before:
        after = {k: v for k, v in after.items() if k != "lift_names"}
        d = {k: after[k] - before[k] for k in after}
        big = d["lifts"] < 0 or d["runs"] < -max(3, before["runs"] * 0.05) or d["named"] < 0
        add(False if big else None, "change from the previous build: " + ", ".join(
            f"{k} {before[k]} -> {after[k]}" for k in after if before[k] != after[k]) if any(d.values())
            else "same counts as the previous build", "fewer lifts or named runs than before: compare before pushing" if big else "")

    for n in notes:
        add(None, n)

    look = [i for i in items if i[0] == "LOOK"]
    lines = [f"# {cfg['name']} ({rid})", "",
             f"Built {datetime.date.today()} by tools/pipeline.py. Terrain: {terrain_note}.", "",
             f"**{after['runs']} runs ({after['named']} named, {after['km']} km), {after['lifts']} lifts. "
             f"{'Ready' if not look else str(len(look)) + ' things to look at'}.**", ""]
    for st, title, detail in sorted(items, key=lambda i: {"LOOK": 0, "info": 1, "pass": 2}[i[0]]):
        lines.append(f"- {'**LOOK**' if st == 'LOOK' else st}: {title}" + (f"  \n  {detail}" if detail else ""))
    os.makedirs(f"{ROOT}/tools/cards", exist_ok=True)
    open(f"{ROOT}/tools/cards/{rid}.md", "w").write("\n".join(lines) + "\n")
    return after, look


def metrics(rid, cfg, logs, notes):
    """The numbers the quality gate reads (tools/bulk/gate.py), from this build's logs: tools/bulk/results/<id>.json."""
    bd = logs.get("build_data", "")
    m = re.search(r"from the base of (.+?): (\d+)/(\d+) trail segments reachable", bd)
    joins = sum(len([j for j in line.split(":", 1)[1].split(";") if j.strip()]) for line in bd.splitlines()
                if line.startswith(("loose run ends joined automatically:", "cut-off runs joined to the nearest reachable point:",
                                    "dead-end runs joined to the nearest way to a lift:")))
    rule = next((line.split(":", 1)[1] for line in bd.splitlines() if line.startswith("lift ends joined by rule:")), "")
    R = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))
    chk = logs.get("check", "")
    mc = re.search(r"(\d+) official runs, (\d+) matched on the map, (\d+) with a different rating", chk)
    out = {"id": rid, "reachable": [int(m.group(2)), int(m.group(3))] if m else None, "auto_joins": joins,
           "rule_joins": [j.strip() for j in rule.split(";") if j.strip()],
           "stuck_lift_ends": lift_ends_stuck(R),
           "climbing_runs": len([r for r in (logs.get("downhill_json") or []) if not r.get("flat")]),
           "raised": sum(1 for t in R["trails"] if t.get("raised") and not t.get("hide")),
           "official": [int(x) for x in mc.groups()] if mc else None,
           "terrain_res": cfg.get("terrain_res"), "terrain_shares": cfg.get("terrain_shares"),
           "notes": notes}
    os.makedirs(f"{ROOT}/tools/bulk/results", exist_ok=True)
    old = f"{ROOT}/tools/bulk/results/{rid}.json"
    prev = json.load(open(old)) if os.path.exists(old) else {}
    json.dump({**prev, **out}, open(old, "w"), indent=1, ensure_ascii=False)


def one(rid, opt):
    cfg = json.load(open(f"{ROOT}/tools/resorts/{rid}.json"))
    w = opt["work"]
    os.makedirs(w, exist_ok=True)
    log = f"{w}/{rid}.log"
    open(log, "w").close()
    osm, dem = f"{w}/{rid}.osm", f"{w}/{rid}.tif"
    notes, logs = [], {}
    bbox = cfg.get("osm_bbox")
    if not bbox:
        bbox = built_bbox(rid)
        notes.append("config has no osm_bbox: used the built map's extent (add osm_bbox to the config)")
    print(f"{rid}:")
    in_r2 = rid in json.load(open(f"{ROOT}/public/data/r2.json"))["ids"]
    if in_r2 and not os.path.exists(f"{ROOT}/public/data/{rid}/resort.json"):
        run(["node", "tools/maps_r2.mjs", "pull", rid], log)

    grew = whole_resort(rid, cfg, bbox, osm, opt, log, notes)
    if grew:
        bbox = cfg["osm_bbox"]
        if os.path.exists(dem):
            os.remove(dem)  # the terrain must cover the larger area: download it again
        opt = {**opt, "terrain": True}
    before = snapshot(rid)
    tnote = "not rebuilt (--checks-only)" if opt["checks_only"] else terrain(rid, cfg, bbox, dem, opt, log)

    off = f"{ROOT}/tools/official/{rid}.json"
    feed = cfg.get("ratings_feed", {})
    if not os.path.exists(off) and "mtnpowder" in feed:
        try:
            run([PY, "tools/official_ratings.py", "fetch", "mtnpowder", str(feed["mtnpowder"]), rid], log)
        except StepFailed as e:   # a feed that no longer lists trails: build with OpenStreetMap's ratings
            notes.append(f"resort feed mtnpowder {feed['mtnpowder']} gave no trail list: {str(e).splitlines()[-1][:120]}")

    if not opt["checks_only"]:
        cfg_path = f"tools/resorts/{rid}.json"
        try:
            logs["build_data"] = run([PY, "tools/build_data.py", cfg_path, osm, f"public/data/{rid}", dem], log)
        except StepFailed as e:
            # the new OpenStreetMap data reaches past the built map (a run or lift added or extended), so the
            # terrain rebuilt from the old map has holes: download the terrain for the new extent and try again
            if "DEM has holes" not in str(e) or opt["terrain"] or tnote.startswith("reused"):
                raise
            notes.append("the map reaches past the old build: terrain downloaded again for the larger extent")
            os.remove(dem)
            tnote = terrain(rid, cfg, bbox, dem, {**opt, "terrain": True}, log)
            logs["build_data"] = run([PY, "tools/build_data.py", cfg_path, osm, f"public/data/{rid}", dem], log)
        if cfg.get("auto"):
            for _ in range(2):   # first a village gondola made two-way, then whatever is still cut off
                iso = isolate_cut_off(rid, json.load(open(f"{ROOT}/public/data/{rid}/resort.json")))
                if not iso:
                    break
                notes.append("lifts fixed by rule (two-way gondola, or isolated: not joined to the rest): " + ", ".join(iso))
                logs["build_data"] = run([PY, "tools/build_data.py", cfg_path, osm, f"public/data/{rid}", dem], log)
        run([PY, "tools/build_extras.py", f"public/data/{rid}"], log)
        run([PY, "tools/build_zones.py", cfg_path, osm, f"public/data/{rid}"], log)
        logs["verify"] = run([PY, "tools/verify_exists.py", rid, osm, "--list"], log)
        # real trees (Meta's canopy map), what covers the land round the map (ESA WorldCover) and the lift and building details OpenStreetMap records; a source that does
        # not answer leaves the map as it was (older trees, generic buildings) rather than stopping the build
        for step in (["tools/build_canopy.py", rid], ["tools/build_landcover.py", rid], ["tools/enrich_osm.py", rid]):
            try:
                run([PY, *step], log)
            except StepFailed as e:
                notes.append(f"{os.path.basename(step[0])} did not finish: {str(e).splitlines()[-1][:120]}")
    else:
        logs["verify"] = run([PY, "tools/verify_exists.py", rid, osm, "--list"], log)
    if os.path.exists(off):
        logs["check"] = run([PY, "tools/official_ratings.py", "check", rid], log)
    logs["audit"] = run([PY, "tools/audit.py", f"tools/resorts/{rid}.json", osm, f"public/data/{rid}", "--list"], log)
    dj = f"{w}/{rid}.downhill.json"
    run(["node", "tools/check_downhill.mjs", rid, "--json", dj], log)
    try:
        d = json.load(open(dj))
        # a run the existence check hides is not on the map: its climb neither needs a look nor counts at the gate
        T = json.load(open(f"{ROOT}/public/data/{rid}/resort.json"))["trails"]
        hid = {(t.get("osm"), t.get("name")) for t in T if t.get("hide")}
        shown = {(t.get("osm"), t.get("name")) for t in T if not t.get("hide")}
        logs["downhill_json"] = [r for r in d if (r.get("osm"), r.get("name")) not in hid - shown]
    except Exception:
        pass
    result = card(rid, cfg, logs, before, tnote, notes)
    if cfg.get("auto"):
        metrics(rid, cfg, logs, notes)
    if opt["r2"] and not opt["checks_only"]:  # never without --r2: R2 is what the live app serves
        run(["node", "tools/maps_r2.mjs", "push", rid], log)
    return result


def mountain_cards(ids):
    """The app's picture of each built mountain (public/photos/<id>.jpg and <id>-s.jpg, listed in cards.json), made
    from its 3D map once index.json lists it. A card that is not made is a LOOK line on the score card."""
    t = time.time()
    env = {**os.environ}
    if not env.get("PW_CHROMIUM") and os.path.exists("/opt/pw-browsers/chromium"):
        env["PW_CHROMIUM"] = "/opt/pw-browsers/chromium"
    p = subprocess.run(["node", "tools/mountain_cards.mjs", *ids], cwd=ROOT, capture_output=True, text=True, env=env)
    out = p.stdout + p.stderr
    made = {line.split(":", 1)[0] for line in out.splitlines() if ": card made (" in line}
    print(f"   {'mountain_cards.mjs':22s} {time.time() - t:6.1f} s  {len(made)} of {len(ids)} cards made")
    why = (out.strip().splitlines() or ["no output"])[-1][:200]
    for rid in ids:
        if rid in made:
            continue
        path = f"{ROOT}/tools/cards/{rid}.md"
        if os.path.exists(path):
            with open(path, "a") as f:
                f.write(f"- **LOOK**: no mountain card made ({why}): run node tools/mountain_cards.mjs {rid}\n")
        print(f"   no mountain card for {rid}: {why}")


def main():
    ids, opt = args()
    results = []
    for rid in ids:
        t = time.time()
        try:
            after, look = one(rid, opt)
            results.append((rid, f"{after['runs']} runs, {after['lifts']} lifts",
                            "ready" if not look else f"{len(look)} to look at", time.time() - t))
            failed = None
        except StepFailed as e:
            print(f"   {e}")
            results.append((rid, "-", "STOPPED: " + str(e).splitlines()[0], time.time() - t))
            failed = str(e)[:600]
        rp = f"{ROOT}/tools/bulk/results/{rid}.json"
        if json.load(open(f"{ROOT}/tools/resorts/{rid}.json")).get("auto"):   # build time and failure, for the gate
            os.makedirs(os.path.dirname(rp), exist_ok=True)
            prev = json.load(open(rp)) if os.path.exists(rp) else {"id": rid}
            prev.update({"seconds": round(time.time() - t), "failed": failed, "built": str(datetime.date.today())})
            json.dump(prev, open(rp, "w"), indent=1, ensure_ascii=False)
    if opt["index"] and not opt["checks_only"]:
        for step in ("build_index.py", "build_globe.py"):
            subprocess.run([PY, f"tools/{step}", "public/data"], cwd=ROOT, capture_output=True)
    built = [rid for rid, m, c, s in results if not c.startswith("STOPPED")]
    if opt["cards"] and not opt["checks_only"] and built:
        mountain_cards(built)
    print("\nresort                 map                     card                         time")
    for rid, m, c, s in results:
        print(f"{rid:22s} {m:23s} {c:28s} {s:5.0f} s")
    print(f"\nscore cards: tools/cards/<id>.md   logs: {opt['work']}/<id>.log")


if __name__ == "__main__":
    main()
