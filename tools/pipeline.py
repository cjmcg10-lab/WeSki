#!/usr/bin/env python3
"""Build or rebuild one or more resorts with one command, then print a score card for each.

usage: python3 tools/pipeline.py <id> [<id> ...] [options]

  --work DIR        where downloads and logs go (default $PIPE_WORK or /tmp/weski-pipe); reused between runs
  --fresh-osm       download the OpenStreetMap extract again even if one is in the work folder
  --terrain         download the terrain again (default for an existing resort: rebuild it from the built map)
  --checks-only     skip the build, only run the checks and write the score card
  --no-index        do not rebuild index.json and globe at the end
  --r2              keep this resort's map files in Cloudflare R2 rather than git (tools/maps_r2.mjs push);
                    a resort already listed in public/data/r2.json is downloaded first and uploaded again after

Steps, in the order docs/MOUNTAIN_CHECKLIST.md asks for:
  1. OpenStreetMap extract for the config's osm_bbox (tools/dev/osmget.py)
  2. terrain: USA  -> USGS 1 m LiDAR, found with the National Map API and read straight from the
                      cloud tiles (only the resort's window is downloaded, tools/fetch_dem.py cog)
              else -> the config's "dem": {"source": "swiss"|"ign"|"gsi"} or
                      {"source": "cog", "epsg": 3035, "urls": [...]} (tools/fetch_dem.py)
              an existing resort without --terrain -> tools/dem_from_built.py (exact, no download)
  3. official ratings: if tools/official/<id>.json is missing and the config names a feed
     ("ratings_feed": {"mtnpowder": 60}), fetch it; otherwise the card says the ratings are NOT checked
  4. build_data, build_extras, build_zones, verify_exists
  5. checks: official_ratings check, audit --list, check_downhill
  6. score card: tools/cards/<id>.md (committed: it is the record of the mountain's state) and a
     line in the summary table printed at the end. Full logs stay in the work folder.
After all resorts: build_index and build_globe.

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
           "checks_only": False, "index": True, "r2": False}
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


def tnm_tiles(b):
    """USGS 1 m DEM tiles over a bounding box, grouped by survey project, newest project first."""
    q = urllib.parse.urlencode({"datasets": "Digital Elevation Model (DEM) 1 meter", "prodFormats": "GeoTIFF",
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
        m = re.match(r"USGS 1 Meter (\d+) x\d+y\d+ (.+)", it["title"])
        proj = m.group(2) if m else it["title"]
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
    groups = tnm_tiles(b)
    if not groups:
        raise StepFailed("no USGS 1 m terrain found for this area: give the config a \"dem\" source")
    # the newest survey that covers the whole area on its own; otherwise newest first, the rest filling gaps
    full = [g for g in groups if coverage(g["tiles"], b) >= 0.999]
    use = [full[0]] if full else groups
    urls = [t["url"] for g in use for t in g["tiles"]]
    zone = (use[0]["tiles"][0]["zone"] or int((b[0] + b[2]) / 2 + 180) // 6 + 1)
    with open(log, "a") as f:
        f.write("\nterrain surveys: " + ", ".join(f"{g['project']} ({g['date']}, {len(g['tiles'])} tiles, "
                                                  f"{coverage(g['tiles'], b) * 100:.0f}% cover)" for g in groups) + "\n")
    run([PY, "tools/fetch_dem.py", "cog", out, *map(str, b), str(26900 + zone), *urls], log)
    return " and ".join(g["project"] for g in use)


def terrain(rid, cfg, bbox, out, opt, log):
    if os.path.exists(out) and not opt["terrain"]:
        return "reused from the work folder"
    built = os.path.exists(f"{ROOT}/public/data/{rid}/resort.json")
    if built and not opt["terrain"]:
        run([PY, "tools/dem_from_built.py", f"public/data/{rid}", out], log)
        return "rebuilt from the existing map (no download)"
    b = pad(bbox, 700)
    if is_usa(cfg) and not cfg.get("dem"):
        return "USGS 1 m LiDAR " + terrain_usa(b, out, log)
    d = cfg.get("dem")
    if isinstance(d, list):  # older form: [source, west, south, east, north]
        d, b = {"source": d[0]}, [float(v) for v in d[1:5]]
    if not d:
        raise StepFailed("no terrain source: add \"dem\" to the config (see tools/pipeline.py)")
    if d["source"] == "cog":
        run([PY, "tools/fetch_dem.py", "cog", out, *map(str, b), str(d["epsg"]), *d["urls"]], log)
    else:
        run([PY, "tools/fetch_dem.py", d["source"], out, *map(str, b)], log)
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
    else:
        add(False, "ratings NOT checked: not ready to go live",
            "make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)")

    guess = [t["name"] or "(no name)" for t in shown if t.get("u") and t.get("len", 0) > 100]
    add(not guess, f"{len(guess)} shown runs rated by guess", ", ".join(sorted(set(guess)))[:500])

    m = re.search(r"from the base of (.+?): (\d+)/(\d+) trail segments reachable; not reachable: (.*)", logs.get("build_data", ""))
    if m:
        a, b = int(m.group(2)), int(m.group(3))
        add(a == b, f"reachable from the base: {a} of {b} run pieces", "" if a == b else "not reachable: " + m.group(4)[:500])

    joins = []
    for key in ("loose run ends joined automatically:", "cut-off runs joined to the nearest reachable point:"):
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

    if not os.path.exists(osm) or opt["fresh_osm"]:
        span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
        run([PY, "tools/dev/osmget.py", osm, *map(str, bbox), str(max(2, math.ceil(span / 0.04)))], log)
    before = snapshot(rid)
    tnote = "not rebuilt (--checks-only)" if opt["checks_only"] else terrain(rid, cfg, bbox, dem, opt, log)

    off = f"{ROOT}/tools/official/{rid}.json"
    feed = cfg.get("ratings_feed", {})
    if not os.path.exists(off) and "mtnpowder" in feed:
        run([PY, "tools/official_ratings.py", "fetch", "mtnpowder", str(feed["mtnpowder"]), rid], log)

    if not opt["checks_only"]:
        cfg_path = f"tools/resorts/{rid}.json"
        logs["build_data"] = run([PY, "tools/build_data.py", cfg_path, osm, f"public/data/{rid}", dem], log)
        run([PY, "tools/build_extras.py", f"public/data/{rid}"], log)
        run([PY, "tools/build_zones.py", cfg_path, osm, f"public/data/{rid}"], log)
        logs["verify"] = run([PY, "tools/verify_exists.py", rid, osm, "--list"], log)
    else:
        logs["verify"] = run([PY, "tools/verify_exists.py", rid, osm, "--list"], log)
    if os.path.exists(off):
        logs["check"] = run([PY, "tools/official_ratings.py", "check", rid], log)
    logs["audit"] = run([PY, "tools/audit.py", f"tools/resorts/{rid}.json", osm, f"public/data/{rid}", "--list"], log)
    dj = f"{w}/{rid}.downhill.json"
    run(["node", "tools/check_downhill.mjs", rid, "--json", dj], log)
    try:
        d = json.load(open(dj))
        logs["downhill_json"] = d
    except Exception:
        pass
    result = card(rid, cfg, logs, before, tnote, notes)
    if (in_r2 or opt["r2"]) and not opt["checks_only"]:
        run(["node", "tools/maps_r2.mjs", "push", rid], log)
    return result


def main():
    ids, opt = args()
    results = []
    for rid in ids:
        t = time.time()
        try:
            after, look = one(rid, opt)
            results.append((rid, f"{after['runs']} runs, {after['lifts']} lifts",
                            "ready" if not look else f"{len(look)} to look at", time.time() - t))
        except StepFailed as e:
            print(f"   {e}")
            results.append((rid, "-", "STOPPED: " + str(e).splitlines()[0], time.time() - t))
    if opt["index"] and not opt["checks_only"]:
        for step in ("build_index.py", "build_globe.py"):
            subprocess.run([PY, f"tools/{step}", "public/data"], cwd=ROOT, capture_output=True)
    print("\nresort                 map                     card                         time")
    for rid, m, c, s in results:
        print(f"{rid:22s} {m:23s} {c:28s} {s:5.0f} s")
    print(f"\nscore cards: tools/cards/<id>.md   logs: {opt['work']}/<id>.log")


if __name__ == "__main__":
    main()
