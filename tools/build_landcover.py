#!/usr/bin/env python3
"""What covers the land around a resort (forest, open ground, water, bare rock): public/data/<id>/landcover.z8.

usage: python3 -I tools/build_landcover.py <id> [<id> ...]      (run after build_extras.py, which makes surround.bin)

The detailed map colours its ground from real tree cover (canopy.z8): forest where the trees are, snow on open ground.
The coarse land around it (surround.bin, about 10 km out) had no such data and was coloured by height alone, almost all
forest, so every snowy clearing and field stopped dead at the detailed map's edge. This file gives the coarse land the
same kind of pattern, and the app fades the detailed map's fine pattern into it near the edge (src/map.js).

Source: ESA WorldCover 10 m 2021 v200 (CC BY 4.0, https://esa-worldcover.org), read straight from its cloud files at a
reduced resolution (the files carry low-resolution copies): a few hundred kilobytes per resort. Classes used:
  10 tree cover -> forest;  80 permanent water -> water;  60 bare / sparse -> bare rock;
  everything else (shrubs, grass, fields, built-up, wetland, moss, snow and ice) -> open ground, snow-covered in winter.

One value per surround.bin point (same grid: resort.json "surround"), each the share of the ~140 m cell round it:
File (.z8) = gzip( "SWL1", nx (uint32 LE), ny (uint32 LE), cell size in metres (float32 LE),
                   forest bytes [nx*ny], water bytes [nx*ny], bare bytes [nx*ny] ), 0-255, rows from south to north.
"""
import gzip
import json
import math
import os
import struct
import sys

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
ENV = {"GDAL_HTTP_USERAGENT": "weski-build", "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MAX_RETRY": "4",
       "GDAL_HTTP_RETRY_DELAY": "2", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif"}
STEP = 35.0           # metres per sample read from the source (its low-resolution copies); 4 x 4 samples per cell


def to_latlon(p, x, y):
    """Local metres to lat/lon: the same polynomial the app and build_extras.py use."""
    a, b = x - p["xm"], y - p["ym"]
    v = np.array([np.ones_like(a), a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3])
    return p["lat0"] + np.tensordot(np.array(p["clat"]), v, 1), p["lon0"] + np.tensordot(np.array(p["clon"]), v, 1)


def tile_name(lat, lon):
    """WorldCover's 3-degree tiles are named after their south-west corner, e.g. N42W075."""
    la, lo = int(math.floor(lat / 3) * 3), int(math.floor(lon / 3) * 3)
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def read_classes(s, w, e, n):
    """The class of every STEP-metre sample over [w, e] x [s, n] (degrees), 0 where no tile covers it."""
    mid = math.radians((s + n) / 2)
    ny_, nx_ = max(2, int((n - s) * 111320 / STEP)), max(2, int((e - w) * 111320 * math.cos(mid) / STEP))
    out = np.zeros((ny_, nx_), np.uint8)
    names = sorted({tile_name(la, lo) for la in np.linspace(s, n, 6) for lo in np.linspace(w, e, 6)})
    with rasterio.Env(**ENV):
        for name in names:
            try:
                src = rasterio.open(URL.format(name))
            except rasterio.errors.RasterioIOError:
                continue                                   # no tile there: open sea
            with src:
                b = src.bounds
                cw, ce, cs, cn = max(w, b.left), min(e, b.right), max(s, b.bottom), min(n, b.top)
                if cw >= ce or cs >= cn:
                    continue
                c0, c1 = int((cw - w) / (e - w) * nx_), int(math.ceil((ce - w) / (e - w) * nx_))
                r0, r1 = int((n - cn) / (n - s) * ny_), int(math.ceil((n - cs) / (n - s) * ny_))
                if c1 <= c0 or r1 <= r0:
                    continue
                win = from_bounds(w + c0 * (e - w) / nx_, n - r1 * (n - s) / ny_, w + c1 * (e - w) / nx_, n - r0 * (n - s) / ny_, src.transform)
                part = src.read(1, window=win, out_shape=(r1 - r0, c1 - c0), resampling=Resampling.nearest, boundless=True, fill_value=0)
                out[r0:r1, c0:c1] = np.where(part > 0, part, out[r0:r1, c0:c1])
    return out


def build(rid):
    d = f"{ROOT}/public/data/{rid}"
    R = json.load(open(f"{d}/resort.json"))
    p, sr = R["proj"], R.get("surround")
    if not sr:
        raise SystemExit(f"{rid}: no surround grid in resort.json (run build_extras.py first)")
    nx, ny, cell = sr["nx"], sr["ny"], sr["cell"]
    # sample points: 4 x 4 per cell round every surround point, in local metres
    k = 4
    offs = (np.arange(k) + 0.5) / k * cell - cell / 2
    xs = sr["x0"] + np.arange(nx) * cell
    ys = sr["y0"] + np.arange(ny) * cell
    X = (xs[None, :, None, None] + offs[None, None, None, :]).repeat(ny, 0).repeat(k, 2)
    Y = (ys[:, None, None, None] + offs[None, None, :, None]).repeat(nx, 1).repeat(k, 3)
    lat, lon = to_latlon(p, X, Y)
    s, n, w, e = lat.min() - 0.002, lat.max() + 0.002, lon.min() - 0.002, lon.max() + 0.002
    cls = read_classes(s, w, e, n)
    rows = np.clip(((n - lat) / (n - s) * cls.shape[0]).astype(int), 0, cls.shape[0] - 1)
    cols = np.clip(((lon - w) / (e - w) * cls.shape[1]).astype(int), 0, cls.shape[1] - 1)
    c = cls[rows, cols]                                     # (ny, nx, k, k)
    known = np.maximum((c > 0).sum((2, 3)), 1)
    share = lambda m: np.clip(np.rint(m.sum((2, 3)) / known * 255), 0, 255).astype(np.uint8)
    forest, water, bare = share(c == 10), share(c == 80), share(c == 60)
    out = f"{d}/landcover.z8"
    with open(out, "wb") as f:
        f.write(gzip.compress(b"SWL1" + struct.pack("<IIf", nx, ny, cell) + forest.tobytes() + water.tobytes() + bare.tobytes(), 9))
    R.setdefault("sources", {})["landcover"] = "ESA WorldCover 10 m 2021 v200 (CC BY 4.0)"
    json.dump(R, open(f"{d}/resort.json", "w"), separators=(",", ":"))
    print(f"{rid}: {nx}x{ny} cells of {cell:g} m: forest {forest.mean() / 2.55:.0f}%, water {water.mean() / 2.55:.0f}%, "
          f"bare {bare.mean() / 2.55:.0f}%, no data {(c == 0).mean() * 100:.0f}%, {os.path.getsize(out) // 1024} KB -> {out}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for rid in sys.argv[1:]:
        build(rid)
