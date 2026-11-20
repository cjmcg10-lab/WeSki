#!/usr/bin/env python3
"""Check and correct where runs are drawn, using aerial photos.

Where a ski run is cut through forest, the photo shows it as a smooth light strip between dark,
textured trees. For each run this script looks across the line every 10 m (up to RANGE metres
either side), finds the open strip, and follows its middle down the run (a Viterbi path that
favours a smooth line). It reports how far the drawn line is from the middle of the cut run,
and the run's width.

usage:
  align_trails.py <id> <src> [--only traced|all|NAME,...] [--test] [--write] [--cache DIR] [--range M]

  src     naip (USA, USGS NAIP Plus), swiss (swisstopo), ign (France), at (basemap.at), gsi (Japan)
  --only  traced (default): runs drawn by hand (extra_trails); all: every run; or a list of names
  --test  also move each checked run sideways by 50, 100 and 150 m and see whether the script
          brings it back (how well the method recovers a misplaced line)
  --write put corrected points into the resort config's extra_trails (traced runs only), when the
          photo evidence is strong; prints every change

Runs above the treeline, glades and open bowls have no strip to find: they are reported as
"no evidence" and left alone. Outside requests use the User-Agent weski-build.
"""
import sys, os, json, math, io, subprocess, argparse, hashlib
import numpy as np
from PIL import Image

STEP = 10.0      # metres between cross-sections along a run
DK = 2.0         # metres between samples across a run
SMOOTH = 1.2     # cost per metre of sideways change between neighbouring cross-sections
PRIOR = 0.04     # cost per metre of moving away from the drawn line (prefer not to move)
CAP = 25.0       # half-width counted at most this much (a wide slope is not "more" of a run)

ap = argparse.ArgumentParser()
ap.add_argument("rid"); ap.add_argument("src")
ap.add_argument("--only", default="traced"); ap.add_argument("--test", action="store_true")
ap.add_argument("--write", action="store_true"); ap.add_argument("--osm", action="store_true", help="with --write: also move OpenStreetMap runs (way_pts in the config)")
ap.add_argument("--force", default="", help="with --write --osm: osm ids checked by eye, written even if more than 70 m away")
ap.add_argument("--range", type=float, default=160)
ap.add_argument("--cache", default=os.environ.get("ALIGN_CACHE", "/tmp/align-cache"))
ap.add_argument("--mpp", type=float, default=1.0, help="photo metres per pixel")
ap.add_argument("--json", default=None, help="write per-run results here")
ap.add_argument("--shift", action="store_true", help="test whether the whole map is shifted against the photo, then stop")
ap.add_argument("--widths", action="store_true", help="save the measured widths to tools/widths/<id>.json (used by build_zones.py)")
ap.add_argument("--debug", default=None, help="save a picture per run in this folder (photo, drawn line red, found line cyan)")
A = ap.parse_args()
RANGE = A.range
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open(f"{ROOT}/public/data/{A.rid}/resort.json")); P = R["proj"]
os.makedirs(A.cache, exist_ok=True)


def ll(x, y):
    a, b = x - P["xm"], y - P["ym"]; v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
    return P["lon0"] + sum(c * w for c, w in zip(P["clon"], v)), P["lat0"] + sum(c * w for c, w in zip(P["clat"], v))


# ---------------------------------------------------------------- photos, fetched in cells of CELL degrees
CELL = 0.01
LAT0 = ll(P["xm"], P["ym"])[1]
KX = math.cos(math.radians(LAT0))


def curl(url):
    r = subprocess.run(["curl", "-s", "-f", "-m", "150", "-A", "weski-build", url], capture_output=True)
    if r.returncode != 0 or len(r.stdout) < 2000:
        return None
    try:
        return Image.open(io.BytesIO(r.stdout)).convert("RGB")
    except Exception:
        return None


def xyz(W, S, E, N, wpx, hpx, url):
    z = 17
    def t(lon, lat):
        n = 2 ** z; return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    x0, y0 = t(W, N); x1, y1 = t(E, S)
    mos = Image.new("RGB", ((int(x1) - int(x0) + 1) * 256, (int(y1) - int(y0) + 1) * 256))
    for X in range(int(x0), int(x1) + 1):
        for Y in range(int(y0), int(y1) + 1):
            im = curl(url.format(z=z, x=X, y=Y))
            if im: mos.paste(im, ((X - int(x0)) * 256, (Y - int(y0)) * 256))
    out = Image.new("RGB", (wpx, hpx))
    for r in range(hpx):
        lat = N - (N - S) * (r + 0.5) / hpx; _, y = t(W, lat); yy = int((y - int(y0)) * 256)
        out.paste(mos.crop((int((x0 - int(x0)) * 256), yy, int((x1 - int(x0)) * 256), yy + 1)).resize((wpx, 1)), (0, r))
    return out


def fetch(W, S, E, N, wpx, hpx):
    if A.src == "naip":
        # ArcGIS keeps square pixels in degrees and widens the box if the picture shape differs, so ask for
        # a picture with the box's own shape in degrees and stretch it afterwards
        n = max(wpx, hpx); im = curl(f"https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={W},{S},{E},{N}"
                    f"&bboxSR=4326&imageSR=4326&size={int(n * (E - W) / (N - S))},{n}&format=jpg&f=image")
        return im.resize((wpx, hpx)) if im else None
    if A.src == "swiss":
        return curl(f"https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:4326"
                    f"&BBOX={S},{W},{N},{E}&WIDTH={wpx}&HEIGHT={hpx}&FORMAT=image/jpeg")
    if A.src == "ign":
        return curl(f"https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:4326"
                    f"&BBOX={S},{W},{N},{E}&WIDTH={wpx}&HEIGHT={hpx}&FORMAT=image/jpeg")
    if A.src == "at":
        return xyz(W, S, E, N, wpx, hpx, "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg")
    if A.src == "gsi":
        return xyz(W, S, E, N, wpx, hpx, "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg")
    raise SystemExit("unknown source " + A.src)


def box_mean(a, r):
    """Mean over a (2r+1) square window, edges clamped."""
    p = np.pad(a, r + 1, mode="edge").cumsum(0).cumsum(1)
    n = 2 * r + 1
    s = p[n:, n:] - p[:-n, n:] - p[n:, :-n] + p[:-n, :-n]
    return s[: a.shape[0], : a.shape[1]] / (n * n)


cells = {}


def cell(i, j):
    """Openness of one photo cell (array, 1 = open snow/grass, 0 = forest), or None."""
    if (i, j) in cells: return cells[(i, j)]
    W, S = i * CELL, j * CELL; E, N = W + CELL, S + CELL
    hpx = int(round(CELL * 111320 / A.mpp)); wpx = int(round(CELL * 111320 * KX / A.mpp))
    key = hashlib.md5(f"{A.src}{W:.4f}{S:.4f}{wpx}{hpx}".encode()).hexdigest()[:16]
    f = f"{A.cache}/{A.src}_{key}.jpg"
    if os.path.exists(f) and os.path.getsize(f) > 0:
        im = Image.open(f).convert("RGB")
    else:
        im = fetch(W, S, E, N, wpx, hpx)
        if im is None:
            open(f, "wb").close(); cells[(i, j)] = None; return None
        im.save(f, quality=90)
    if os.path.getsize(f) == 0: cells[(i, j)] = None; return None
    a = np.asarray(im.resize((wpx, hpx)), dtype=np.float32)
    g = a.mean(axis=2)
    r = max(1, int(round(2.0 / A.mpp)))
    m = box_mean(g, r); sd = np.sqrt(np.maximum(box_mean(g * g, r) - m * m, 0))
    m2 = box_mean(m, r * 2)
    cells[(i, j)] = (m2, box_mean(sd, r * 2), W, N, wpx, hpx)
    return cells[(i, j)]


THR = None


def raw(lon, lat):
    c = cell(math.floor(lon / CELL), math.floor(lat / CELL))
    if c is None: return None
    m, sd, W, N, wpx, hpx = c
    px = int((lon - W) / CELL * wpx); py = int((N - lat) / CELL * hpx)
    if 0 <= px < wpx and 0 <= py < hpx: return m[py, px], sd[py, px]
    return None


def otsu(v):
    h, e = np.histogram(v, bins=64); h = h.astype(float); c = (e[:-1] + e[1:]) / 2
    best, t = -1, c[len(c) // 2]
    for k in range(1, 63):
        w0, w1 = h[:k].sum(), h[k:].sum()
        if w0 == 0 or w1 == 0: continue
        m0, m1 = (h[:k] * c[:k]).sum() / w0, (h[k:] * c[k:]).sum() / w1
        s = w0 * w1 * (m0 - m1) ** 2
        if s > best: best, t = s, c[k]
    return t


# ---------------------------------------------------------------- cross-sections
def resample(pts, step):
    xy = np.array(pts, dtype=float).reshape(-1, 2)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(xy, axis=0).T))]
    if d[-1] < step: return xy, d
    s = np.arange(0, d[-1] + 1e-6, step)
    return np.c_[np.interp(s, d, xy[:, 0]), np.interp(s, d, xy[:, 1])], s


def normals(xy):
    t = np.gradient(xy, axis=0); t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-9)[:, None]
    # smooth the direction over ~50 m so a kink does not swing the cross-sections around
    k = 5
    if len(t) > k:
        t = np.array([t[max(0, i - k): i + k + 1].mean(0) for i in range(len(t))])
        t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-9)[:, None]
    return np.c_[t[:, 1], -t[:, 0]]


OFFS = np.arange(-RANGE, RANGE + 1e-6, DK)


def sections(xy):
    """openness matrix [len(xy), len(OFFS)]: 1 open, 0 forest, nan no photo."""
    nr = normals(xy)
    O = np.full((len(xy), len(OFFS)), np.nan)
    for i, (p, n) in enumerate(zip(xy, nr)):
        for k, o in enumerate(OFFS):
            q = ll(p[0] + n[0] * o, p[1] + n[1] * o)
            v = raw(*q)
            if v is None: continue
            O[i, k] = 1.0 if (v[0] > THR[0] and v[1] < THR[1]) else 0.0
    return O, nr


def centredness(O):
    """For each sample across: metres to the nearest forest on the nearer side (0 in forest)."""
    C = np.zeros_like(O)
    for i in range(O.shape[0]):
        row = np.nan_to_num(O[i], nan=0.0) > 0.5
        L = np.zeros(len(row)); Rr = np.zeros(len(row))
        run = 0
        for k in range(len(row)):
            run = run + 1 if row[k] else 0; L[k] = run
        run = 0
        for k in range(len(row) - 1, -1, -1):
            run = run + 1 if row[k] else 0; Rr[k] = run
        C[i] = np.minimum(np.minimum(L, Rr) * DK, CAP)
    return C


def viterbi(C, start_off=None):
    n, K = C.shape
    prior = np.zeros(len(OFFS))
    if start_off is not None: prior = PRIOR * np.abs(OFFS - start_off)
    score = C[0] - prior
    back = np.zeros((n, K), dtype=int)
    jump = SMOOTH * DK
    for i in range(1, n):
        # best predecessor for each k: max over j of score[j] - jump*|j-k|  (distance transform, 2 passes)
        best = score.copy(); arg = np.arange(K)
        for k in range(1, K):
            if best[k - 1] - jump > best[k]: best[k] = best[k - 1] - jump; arg[k] = arg[k - 1]
        for k in range(K - 2, -1, -1):
            if best[k + 1] - jump > best[k]: best[k] = best[k + 1] - jump; arg[k] = arg[k + 1]
        back[i] = arg
        score = best + C[i] - prior
    k = int(np.argmax(score)); path = [k]
    for i in range(n - 1, 0, -1):
        k = back[i, k]; path.append(k)
    return np.array(path[::-1])


def align(pts):
    """-> dict: off (metres per cross-section), xy (corrected), width, evidence (share of the run with a clear strip)."""
    xy, s = resample(pts, STEP)
    if len(xy) < 4: return None
    O, nr = sections(xy)
    have = ~np.isnan(O).all(axis=1)
    if have.mean() < 0.7: return {"evidence": 0, "why": "no photo"}
    C = centredness(O)
    # open everywhere (treeless) or forest everywhere: nothing to follow
    openness = np.nanmean(O)
    # being inside a strip counts the same for a narrow trail and a wide slope (a wide slope next
    # door must not win), plus a little for being in the middle of it
    path = viterbi(np.minimum(C, 6.0) + 0.15 * C, 0.0)
    off = OFFS[path]
    c = C[np.arange(len(path)), path]
    evidence = float((c >= 4).mean())
    # a cut run has forest on both sides within reach: share of sections where the strip is bounded
    bounded = float(np.mean([(O[i, :path[i]] < 0.5).any() and (O[i, path[i]:] < 0.5).any() for i in range(len(path))]))
    k = 3   # smooth the offsets over ~70 m
    offs = np.array([off[max(0, i - k): i + k + 1].mean() for i in range(len(off))])
    out = xy + nr * offs[:, None]
    return {"off": offs, "xy": out, "base": xy, "nr": nr, "width": float(np.median(2 * c[c > 0])) if (c > 0).any() else 0,
            "evidence": evidence, "bounded": bounded, "open": float(openness), "C": C}


def picture(t, r):
    from PIL import ImageDraw
    os.makedirs(A.debug, exist_ok=True)
    pts = np.vstack([r["base"], r["xy"]]); x0, y0 = pts.min(0) - RANGE; x1, y1 = pts.max(0) + RANGE
    W, S = ll(x0, y0); E, N = ll(x1, y1)
    W, E = min(W, E), max(W, E); S, N = min(S, N), max(S, N)
    sc = 1.0; wpx = int((x1 - x0) / sc); hpx = int((y1 - y0) / sc)
    if wpx * hpx > 9e6: sc = math.sqrt(wpx * hpx / 9e6); wpx = int(wpx / sc); hpx = int(hpx / sc)
    im = Image.new("RGB", (wpx, hpx)); px = im.load()
    for yy in range(0, hpx):
        for xx in range(0, wpx):
            lon, lat = ll(x0 + xx * sc, y1 - yy * sc)
            c = cell(math.floor(lon / CELL), math.floor(lat / CELL))
            if c is None: continue
            m, sd, cW, cN, cw, ch = c
            i = int((lon - cW) / CELL * cw); j = int((cN - lat) / CELL * ch)
            if 0 <= i < cw and 0 <= j < ch:
                op = m[j, i] > THR[0] and sd[j, i] < THR[1]
                v = int(m[j, i]); px[xx, yy] = (v, min(255, v + 60), v) if op else (v // 2, v // 2, v // 2)
    d = ImageDraw.Draw(im)
    f = lambda q: [((p[0] - x0) / sc, (y1 - p[1]) / sc) for p in q]
    for u in trails:
        if u is t: continue
        a = np.array(u["pts"], dtype=float).reshape(-1, 2)
        if a[:, 0].max() < x0 or a[:, 0].min() > x1 or a[:, 1].max() < y0 or a[:, 1].min() > y1: continue
        d.line(f(a), fill=(255, 220, 0), width=1)
    d.line(f(r["base"]), fill=(255, 0, 0), width=3); d.line(f(r["xy"]), fill=(0, 255, 255), width=3)
    im.save(f"{A.debug}/{(t['name'] or str(t['osm'])).replace('/', '_')}_{t['osm']}.jpg", quality=85)


_lines = None


def others(t):
    global _lines
    if _lines is None:
        _lines = [(u, np.array(u["pts"], dtype=float).reshape(-1, 2)) for u in trails]
    for u, a in _lines:
        if u is not t and u["name"] != t["name"]: yield (u, a)


def near(ua, p, d):
    u, a = ua
    if a[:, 0].min() - d > p[0] or a[:, 0].max() + d < p[0] or a[:, 1].min() - d > p[1] or a[:, 1].max() + d < p[1]: return False
    v = a[1:] - a[:-1]; w = p - a[:-1]
    tt = np.clip((w * v).sum(1) / np.maximum((v * v).sum(1), 1e-9), 0, 1)
    return bool((np.hypot(*(a[:-1] + v * tt[:, None] - p).T) < d).any())


# ---------------------------------------------------------------- which runs
trails = R["trails"]
if A.only == "traced": sel = [t for t in trails if t.get("traced")]
elif A.only == "all": sel = [t for t in trails if not t.get("glade") and t["len"] >= 150]
elif A.only.startswith("osm:"):
    ids = set(A.only[4:].split(",")); sel = [t for t in trails if str(t["osm"]) in ids]
else:
    names = set(A.only.split(",")); sel = [t for t in trails if t["name"] in names]

# threshold from the photo cells under the selected runs
samp = []
for t in sel:
    xy, _ = resample(t["pts"], 40)
    for p in xy:
        for o in (-60, 0, 60):
            n = (0, 0)
            v = raw(*ll(p[0] + o, p[1]))
            if v: samp.append(v)
samp = np.array(samp)
if not len(samp): raise SystemExit("no photos for this area")
THR = (otsu(samp[:, 0]), otsu(samp[:, 1]))
print(f"{A.rid}: {len(sel)} runs, {len(cells)} photo cells, brightness threshold {THR[0]:.0f}, texture threshold {THR[1]:.1f}")

if A.shift:
    # Sample every run every 20 m; for each whole-map shift, the share of samples on open ground. A map traced
    # from offset imagery shows a clear best shift away from (0, 0).
    # only OpenStreetMap runs: hand-drawn runs were traced on the terrain, which is in its true position
    S = []
    for t in sel:
        if t.get("traced"): continue
        xy, _ = resample(t["pts"], 20); S += [tuple(p) for p in xy]
    S = np.array(S)
    best = {}
    for dx in range(-36, 37, 3):
        for dy in range(-36, 37, 3):
            v = [raw(*ll(x + dx, y + dy)) for x, y in S]
            o = [1.0 if (q[0] > THR[0] and q[1] < THR[1]) else 0.0 for q in v if q]
            best[(dx, dy)] = float(np.mean(o)) if o else 0
    (bx, by), bv = max(best.items(), key=lambda kv: kv[1])
    print(f"SHIFT {A.rid}: on open ground with no shift {best[(0, 0)]:.3f}; best shift x {bx} m, y {by} m: {bv:.3f} ({len(S)} samples)")
    raise SystemExit

results = []
for t in sel:
    r = align(t["pts"])
    if not r or "off" not in r:
        print(f"  {t['name'] or '#'+str(t['osm'])}: no photo"); continue
    good = r["evidence"] >= 0.6 and r["bounded"] >= 0.6
    # the strip found may already be another mapped run: then it is not this run's strip
    taken = None
    if good and float(np.abs(r["off"]).mean()) > 8:
        hits = {}
        for p in r["xy"][:: 2]:
            for ua in others(t):
                if near(ua, p, 15):
                    nm = ua[0]["name"] or "#"; hits[nm] = hits.get(nm, 0) + 1; break
        if hits:
            k = max(hits, key=hits.get)
            if hits[k] >= 0.4 * len(r["xy"][:: 2]): taken = k
    tree = bool(t.get("glade")) or any(w in (t["name"] or "").lower() for w in ("glade", "woods", "trees", "forest", "wald"))
    o = np.abs(r["off"])
    row = {"name": t["name"], "osm": t["osm"], "traced": bool(t.get("traced")), "len": t["len"], "evidence": round(r["evidence"], 2),
           "bounded": round(r["bounded"], 2), "width": round(r["width"]), "mean_off": round(float(o.mean()), 1),
           "max_off": round(float(o.max()), 1), "good": good, "taken": taken, "tree": tree}
    if A.test and good:
        rec = []
        for D in (50, 100, 150):
            for sgn in (1, -1):
                moved = (r["base"] + r["nr"] * sgn * D).ravel().tolist()
                q = align(moved)
                if not q or "off" not in q: continue
                # distance from the recovered line to the line found from the original drawing
                e = np.hypot(*(q["xy"][: len(r["xy"])] - r["xy"][: len(q["xy"])]).T)
                rec.append((D * sgn, round(float(np.median(e)), 1)))
        row["test"] = rec
    results.append((t, r, row))
    if A.debug: picture(t, r)
    flag = "" if good else "  (weak evidence: left alone)"
    if taken: flag += f"  (the strip found is the mapped run {taken}: left alone)"
    if tree and good and not taken and row["mean_off"] >= 3: flag += "  (glade or tree run: strips nearby are other runs, left alone)"
    print(f"  {row['name'] or '#'+str(row['osm'])}{' [traced]' if row['traced'] else ''}: off by {row['mean_off']} m on average, "
          f"{row['max_off']} m at most; width {row['width']} m; strip found on {round(100*row['evidence'])}%{flag}"
          + (f"; moved-line test {row['test']}" if row.get("test") else ""))

if A.json:
    json.dump([row for _, _, row in results], open(A.json, "w"), indent=1)

if A.write:
    cfgf = f"{ROOT}/tools/resorts/{A.rid}.json"; cfg = json.load(open(cfgf))
    byname = {e["name"]: e for e in cfg.get("extra_trails", [])}
    n = 0
    for t, r, row in results:
        if not (row["traced"] and row["good"] and t["name"] in byname) or row["taken"] or row["tree"]: continue
        if row["mean_off"] < 3: continue
        if row["max_off"] > 70:
            print(f"  NOT written {t['name']}: the strip found is {row['max_off']} m away, which may be a neighbouring run; check the picture")
            continue
        e = byname[t["name"]]
        xy = r["xy"]
        # keep the run's own direction (top to bottom as in the config)
        idx = np.linspace(0, len(xy) - 1, min(len(xy), max(4, int(t["len"] // 30) + 1))).round().astype(int)
        new = [[round(c, 5) for c in ll(*xy[i])] for i in idx]
        e0 = e["pts"]
        d0 = math.hypot((new[0][0] - e0[0][0]) * 111320 * KX, (new[0][1] - e0[0][1]) * 111320)
        d1 = math.hypot((new[0][0] - e0[-1][0]) * 111320 * KX, (new[0][1] - e0[-1][1]) * 111320)
        if d1 < d0: new = new[::-1]
        e["pts"] = new; e["aligned"] = f"{A.src} photo, moved {row['mean_off']} m on average"
        n += 1
        print(f"  wrote {t['name']}: moved {row['mean_off']} m on average")
    m = 0
    force = set(A.force.split(",")) - {""}
    for t, r, row in results if A.osm else []:
        if row["traced"] or not row["good"] or row["taken"] or row["tree"] or row["mean_off"] < 10: continue
        if row["max_off"] > 70 and str(t["osm"]) not in force:
            print(f"  NOT written {t['name']} ({t['osm']}): {row['max_off']} m away at most; check the picture, then --force"); continue
        if t["osm"] >= 9e9:   # parts made by the build (split ways, joins) are not OpenStreetMap ways
            print(f"  NOT written {t['name']} ({t['osm']}): not an OpenStreetMap way"); continue
        xy = r["xy"]
        idx = np.linspace(0, len(xy) - 1, min(len(xy), max(4, int(t["len"] // 25) + 1))).round().astype(int)
        cfg.setdefault("way_pts", {})[str(t["osm"])] = {"pts": [[round(c, 6) for c in ll(*xy[i])] for i in idx], "len": round(t["len"]),
                                                        "why": f"{A.src} photo: drawn {row['mean_off']} m beside the cut run"}
        m += 1
        print(f"  wrote {t['name']} ({t['osm']}): moved {row['mean_off']} m on average")
    if n or m:
        json.dump(cfg, open(cfgf, "w"), ensure_ascii=False, indent=1); open(cfgf, "a").write("\n")
    print(f"{n} traced runs and {m} OpenStreetMap runs corrected in {cfgf}")

if A.widths:
    wf = f"{ROOT}/tools/widths/{A.rid}.json"; os.makedirs(os.path.dirname(wf), exist_ok=True)
    W = json.load(open(wf)) if os.path.exists(wf) else {}
    for t, r, row in results:
        # only where the strip was clear and the drawn line is on it
        if row["good"] and row["mean_off"] <= 15 and 8 <= row["width"] <= 120:
            W[f"name:{t['name']}" if row["traced"] else str(t["osm"])] = row["width"]
    json.dump(dict(sorted(W.items())), open(wf, "w"), indent=0); open(wf, "a").write("\n")
    print(f"{len(W)} run widths in {wf}")
