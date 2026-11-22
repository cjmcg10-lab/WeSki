#!/usr/bin/env python3
"""Where the trees really are at a resort, and how tall: public/data/<id>/canopy.z8.

usage: python3 -I tools/build_canopy.py <id> [<id> ...]

Source: Meta and World Resources Institute's global 1 m canopy height map (High Resolution Canopy Height Maps,
CC BY 4.0, https://registry.opendata.aws/dataforgood-fb-forests/), read straight from its cloud files: only the
resort's window is downloaded. Tree heights are modelled from satellite photos taken 2009-2020, so a run cut since
then can still show as forest; the app always draws mapped runs over it.

The canopy is summarised on a grid of half a terrain cell (7 m on a 14 m map), aligned with the terrain:
  cover   share of the cell under trees taller than 3 m (0-255)
  height  average height of those trees, in metres (0-255)
The app plants its trees from it (real density and placement, same tree budget as before) and colours open ground
as snow and wooded ground as forest.

File (.z8) = gzip( "SWC1", width (uint32 LE), height (uint32 LE), cell size in metres (float32 LE),
                   cover bytes [width*height], height bytes [width*height] ), rows from south to north.
"""
import gzip
import json
import math
import os
import struct
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.merge import merge

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHM = "/vsicurl/https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/{}.tif"
TREE_M = 3.0          # taller than this counts as a tree
ENV = {"GDAL_HTTP_USERAGENT": "weski-build", "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MAX_RETRY": "4",
       "GDAL_HTTP_RETRY_DELAY": "2", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif"}


def basis(a, b):
    return np.stack([np.ones_like(a), a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3])


def quadkey(lon, lat, z=9):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return "".join(str((1 if x & (1 << (i - 1)) else 0) + (2 if y & (1 << (i - 1)) else 0)) for i in range(z, 0, -1))


def box_sum(a, r):
    """Sum of a over a (2r+1)-square around every pixel (integral image)."""
    s = np.pad(a, ((r + 1, r), (r + 1, r))).cumsum(0).cumsum(1)
    return s[2 * r + 1:, 2 * r + 1:] - s[:-2 * r - 1, 2 * r + 1:] - s[2 * r + 1:, :-2 * r - 1] + s[:-2 * r - 1, :-2 * r - 1]


def build(rid):
    d = f"{ROOT}/public/data/{rid}"
    R = json.load(open(f"{d}/resort.json"))
    P, g = R["proj"], R["grid"]
    c = g["cell"] / 2
    cw, ch = (g["nx"] - 1) * 2, (g["ny"] - 1) * 2
    # every canopy cell's centre, local metres -> lon/lat -> web mercator (the canopy files' projection)
    xs, ys = np.meshgrid((np.arange(cw) + 0.5) * c, (np.arange(ch) + 0.5) * c)
    v = basis(xs - P["xm"], ys - P["ym"])
    lon = P["lon0"] + np.tensordot(np.array(P["clon"]), v, 1)
    lat = P["lat0"] + np.tensordot(np.array(P["clat"]), v, 1)
    mx, my = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform(lon, lat)
    pad = 2 * c
    bounds = (mx.min() - pad, my.min() - pad, mx.max() + pad, my.max() + pad)
    keys = sorted({quadkey(lo, la) for lo in (lon.min(), lon.max()) for la in (lat.min(), lat.max())})
    with rasterio.Env(**ENV):
        srcs = [rasterio.open(CHM.format(k)) for k in keys]
        chm, tf = merge(srcs, bounds=bounds, nodata=0)
        for s in srcs:
            s.close()
    chm = chm[0].astype(np.float32)
    res = tf.a
    tree = (chm > TREE_M).astype(np.float32)
    r = max(1, int(round(c / res / 2)))             # box of about one canopy cell
    n = box_sum(np.ones_like(tree), r)
    cover = box_sum(tree, r) / n
    hsum = box_sum(chm * tree, r)
    tall = np.where(cover > 0, hsum / np.maximum(box_sum(tree, r), 1), 0)
    inv = ~tf
    col, row = inv * (mx, my)
    row = np.clip(row.astype(int), 0, chm.shape[0] - 1)
    col = np.clip(col.astype(int), 0, chm.shape[1] - 1)
    cov8 = np.clip(np.rint(cover[row, col] * 255), 0, 255).astype(np.uint8)
    hgt8 = np.clip(np.rint(tall[row, col]), 0, 255).astype(np.uint8)
    out = f"{d}/canopy.z8"
    with open(out, "wb") as f:
        f.write(gzip.compress(b"SWC1" + struct.pack("<IIf", cw, ch, c) + cov8.tobytes() + hgt8.tobytes(), 9))
    share = (cov8 > 128).mean() * 100
    print(f"{rid}: {cw}x{ch} cells of {c:g} m, {share:.0f}% wooded, median tree {np.median(hgt8[cov8 > 128]) if share else 0:.0f} m, "
          f"{os.path.getsize(out) // 1024} KB -> {out}  (tiles {', '.join(keys)})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for rid in sys.argv[1:]:
        build(rid)
