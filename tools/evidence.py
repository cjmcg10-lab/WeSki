#!/usr/bin/env python3
"""Independent evidence that each run on a map physically exists.

  evidence.py <id> [--pages N] [--photo <align json>]     writes tools/evidence/<id>.json
  evidence.py <id> --heat-only                            only refreshes the app's ski counts in that file

The resort's own trail list says what is official, but resorts leave real runs off their maps (tree runs, short
links, new runs). This gathers evidence that does not come from the resort or from OpenStreetMap's run lines:

  gps    public GPS traces people uploaded to OpenStreetMap (api.openstreetmap.org/api/0.6/trackpoints, ODbL):
         for each run, how many separate traces follow it for at least 40% of its length within 20 m.
  photo  the aerial-photo check (tools/align_trails.py --json): share of the run where a cut strip of open
         ground was found in the forest (only meaningful below the treeline; 0 in open bowls and glades).
  ski    the app's own anonymous ski counts (GET /api/heat/<id> on the live server, from skiers who switched on
         "Help improve the maps"): ski days on each run, and 20 m squares skied off every mapped run. The server
         publishes a run or square only once 5 different ski days reached it, so this is empty at first.
         Groups of three or more touching squares are printed as possible missing runs, with the nearest shown
         run and an OpenStreetMap link.

tools/evidence/<id>.json: "runs" maps osm way id -> {"gps": traces, "cover": best share followed, "photo": share or
null, "ski": ski days from the app (0 when none published)}; "ski" holds {"days", "k", "off": [groups off the runs]}.
tools/verify_exists.py reads it: a run the resort does not list is marked "seen" when two or more traces follow it
or the photo shows its strip, so the app can say how it was confirmed. Traces are cached in $EVIDENCE_CACHE
(default /tmp/evidence-cache) so a re-run downloads nothing.
"""
import json, math, os, subprocess, sys, argparse, re
import xml.etree.ElementTree as ET
from reports import fetch_json, SERVER
from skiheat import clean_heat, clusters, describe_clusters, empty_heat, run_counts

ap = argparse.ArgumentParser()
ap.add_argument("rid")
ap.add_argument("--pages", type=int, default=40, help="most pages of 5000 points per area to fetch")
ap.add_argument("--photo", default=None, help="results of align_trails.py --json for this resort")
ap.add_argument("--heat-only", action="store_true", help="keep the GPS and photo results, refresh only the ski counts")
ap.add_argument("--server", default=SERVER, help="where to read /api/heat/<id> (default: the live app)")
A = ap.parse_args()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open(f"{ROOT}/public/data/{A.rid}/resort.json")); P = R["proj"]
CACHE = os.environ.get("EVIDENCE_CACHE", "/tmp/evidence-cache")
os.makedirs(CACHE, exist_ok=True)


def poly(c, a, b):
    v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
    return sum(k * w for k, w in zip(c, v))


def ll(x, y):
    a, b = x - P["xm"], y - P["ym"]
    return P["lon0"] + poly(P["clon"], a, b), P["lat0"] + poly(P["clat"], a, b)


def xy(lon, lat):
    a, b = lon - P["lon0"], lat - P["lat0"]
    return poly(P["cx"], a, b), poly(P["cy"], a, b)


pts = lambda f: [(f["pts"][i], f["pts"][i + 1]) for i in range(0, len(f["pts"]), 2)]

def heat_for(rid):
    """The app's published ski counts, or empty ones when the server has none or cannot be reached."""
    try:
        return clean_heat(fetch_json(f"{A.server.rstrip('/')}/api/heat/{rid}"))
    except RuntimeError as e:
        print(f"  ski counts: {e}; carrying on without them", file=sys.stderr)
        return empty_heat()


OUT_FILE = f"{ROOT}/tools/evidence/{A.rid}.json"
if not A.heat_only:
    # ---------------------------------------------------------------- traces in the area of the runs
    xs = [p for t in R["trails"] for p in pts(t)]
    x0, x1 = min(p[0] for p in xs) - 200, max(p[0] for p in xs) + 200
    y0, y1 = min(p[1] for p in xs) - 200, max(p[1] for p in xs) + 200
    W, S = ll(x0, y0); E, N = ll(x1, y1)
    # the API takes boxes of at most 0.25 square degrees; split if needed
    nx = max(1, math.ceil((E - W) / 0.45)); ny = max(1, math.ceil((N - S) / 0.45))
    segs = []          # (trace number, [(x, y), ...])
    ntr = 0
    for i in range(nx):
        for j in range(ny):
            box = (W + (E - W) * i / nx, S + (N - S) * j / ny, W + (E - W) * (i + 1) / nx, S + (N - S) * (j + 1) / ny)
            bb = ",".join(f"{v:.5f}" for v in box)
            for page in range(A.pages):
                f = f"{CACHE}/{A.rid}_{i}_{j}_{page}.gpx"
                if not os.path.exists(f):
                    url = f"https://api.openstreetmap.org/api/0.6/trackpoints?bbox={bb}&page={page}"
                    r = subprocess.run(["curl", "-s", "-f", "-m", "120", "-A", "weski-build", "-o", f + ".part", url])
                    if r.returncode != 0:
                        print("  could not fetch", url, file=sys.stderr); break
                    os.replace(f + ".part", f)
                n = 0
                try:
                    root = ET.parse(f).getroot()
                except ET.ParseError:
                    break
                for trk in root.iter("{http://www.topografix.com/GPX/1/0}trk"):
                    ntr += 1
                    for seg in trk.iter("{http://www.topografix.com/GPX/1/0}trkseg"):
                        line = [xy(float(p.get("lon")), float(p.get("lat"))) for p in seg.iter("{http://www.topografix.com/GPX/1/0}trkpt")]
                        n += len(line)
                        if len(line) >= 2:
                            segs.append((ntr, line))
                if n < 5000:
                    break

    # grid of trace segments, 20 m cells
    G = {}
    CELL = 20.0
    for k, (tid, line) in enumerate(segs):
        for a, b in zip(line, line[1:]):
            if math.dist(a, b) > 150:      # a gap in the recording, not a line on the ground
                continue
            for s in range(int(math.dist(a, b) // 10) + 1):
                f = s * 10 / max(1e-9, math.dist(a, b))
                if f > 1:
                    break
                p = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
                G.setdefault((int(p[0] // CELL), int(p[1] // CELL)), set()).add(tid)


    def near(p, r=20):
        out = set()
        cx, cy = int(p[0] // CELL), int(p[1] // CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                out |= G.get((cx + dx, cy + dy), set())
        return out


    def samples(P_, step=10):
        out = []
        for a, b in zip(P_, P_[1:]):
            d = math.dist(a, b)
            for s in range(max(1, int(d // step))):
                f = s * step / d if d else 0
                out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
        out.append(P_[-1])
        return out


    photo = {}
    if A.photo and os.path.exists(A.photo):
        for row in json.load(open(A.photo)):
            if row.get("osm"):
                photo[row["osm"]] = round(row.get("evidence") or 0, 2) if row.get("good") or row.get("evidence") else 0.0

    out = {}
    for t in R["trails"]:
        if t.get("osm") is None:
            continue
        sm = samples(pts(t))
        cnt = {}
        for p in sm:
            for tid in near(p):
                cnt[tid] = cnt.get(tid, 0) + 1
        follow = [c / len(sm) for c in cnt.values()]
        out[str(t["osm"])] = {"gps": sum(1 for c in follow if c >= 0.4), "cover": round(max(follow, default=0), 2),
                              "photo": photo.get(t["osm"])}
else:
    try:
        old = json.load(open(OUT_FILE))
    except (OSError, ValueError):
        sys.exit(f"{OUT_FILE} not found: run evidence.py {A.rid} once without --heat-only")
    ntr, out = old.get("traces", 0), old.get("runs", {})

heat = heat_for(A.rid)
ski = run_counts(heat, R)
for k, v in out.items():
    v["ski"] = ski.get(k, 0)
off = describe_clusters(clusters(heat["cells"], heat["cell"]), R)
os.makedirs(f"{ROOT}/tools/evidence", exist_ok=True)
json.dump({"traces": ntr, "runs": out, "ski": {"days": heat["days"], "k": heat["k"], "off": off}}, open(OUT_FILE, "w"),
          separators=(",", ":"))
seen = sum(1 for v in out.values() if v["gps"] >= 2)
print(f"{A.rid}: {ntr} public traces; {seen} of {len(out)} runs followed by two or more")
print(f"  app ski counts: {heat['days']} ski days received; {sum(1 for v in out.values() if v['ski'])} runs and "
      f"{len(heat['cells'])} squares off the runs published (at least {heat['k']} ski days each)")
names = {str(t["osm"]): t.get("name") or "(no name)" for t in R["trails"] if t.get("osm") is not None}
rows = sorted(((k, v) for k, v in out.items() if v["ski"] or v["gps"]), key=lambda kv: (-kv[1]["ski"], -kv[1]["gps"]))
if rows:
    print(f"  {'run':34} {'osm way':>11} {'GPS traces':>10} {'ski days':>8}")
    for k, v in rows[:40]:
        print(f"  {names.get(k, '?')[:34]:34} {k:>11} {v['gps']:>10} {v['ski']:>8}")
    if len(rows) > 40:
        print(f"  ... {len(rows) - 40} more in {OUT_FILE}")
if off:
    print("  skied off the shown runs (possible missing runs):")
    for g in off:
        print(f"    {g['cells']:>4} squares, up to {g['days']} ski days, {g['near_m']} m from {g['near']}: {g['link']}")
