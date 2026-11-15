#!/usr/bin/env python3
"""Surrounding terrain for one resort (run after build_data.py).

  surround.bin  coarse terrain for ~10 km around the resort, from the free AWS/Mapzen
                Terrarium elevation tiles (SRTM/3DEP derived), 140 m grid, Uint16 metres

usage: build_extras.py <public/data/<resort id> dir>
"""
import io
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image
from pyproj import Transformer

out = sys.argv[1]
resort = json.load(open(f"{out}/resort.json"))
g, p = resort["grid"], resort["proj"]
W, H = (g["nx"] - 1) * g["cell"], (g["ny"] - 1) * g["cell"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "weski-build"})
    return urllib.request.urlopen(req, timeout=60).read()


# ---------- surround terrain
CELL, PAD, Z = 140.0, 10080.0, 11
nx, ny = int((W + 2 * PAD) / CELL) + 2, int((H + 2 * PAD) / CELL) + 2


def to_latlon(x, y):  # same polynomial the app uses
    a, b = x - p["xm"], y - p["ym"]
    v = np.array([np.ones_like(a), a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3])
    return p["lat0"] + np.tensordot(np.array(p["clat"]), v, 1), p["lon0"] + np.tensordot(np.array(p["clon"]), v, 1)


xs, ys = np.meshgrid(-PAD + np.arange(nx) * CELL, -PAD + np.arange(ny) * CELL)
lat, lon = to_latlon(xs, ys)
n = 2 ** Z
px = (lon + 180) / 360 * n * 256
py = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n * 256
tx0, tx1, ty0, ty1 = int(px.min() // 256), int(px.max() // 256), int(py.min() // 256), int(py.max() // 256)
mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        im = np.asarray(Image.open(io.BytesIO(get(f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{tx}/{ty}.png"))).convert("RGB"), dtype=np.float64)
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768
fx, fy = px - tx0 * 256 - 0.5, py - ty0 * 256 - 0.5
i, j = np.clip(fx.astype(int), 0, mosaic.shape[1] - 2), np.clip(fy.astype(int), 0, mosaic.shape[0] - 2)
u, v = fx - i, fy - j
z = mosaic[j, i] * (1 - u) * (1 - v) + mosaic[j, i + 1] * u * (1 - v) + mosaic[j + 1, i] * (1 - u) * v + mosaic[j + 1, i + 1] * u * v
# single-cell voids in the source tiles show up as spikes hundreds of metres deep: replace them with the local median
pad = np.pad(z, 1, mode="edge")
med = np.median(np.stack([pad[a:a + z.shape[0], b:b + z.shape[1]] for a in range(3) for b in range(3)]), axis=0)
z = np.where(np.abs(z - med) > 250, med, z)
zmin = math.floor(z.min())
np.round(z - zmin).astype("<u2").tofile(f"{out}/surround.bin")
resort["surround"] = {"nx": nx, "ny": ny, "cell": CELL, "x0": -PAD, "y0": -PAD, "zmin": zmin}
resort["sources"]["surround"] = "Mapzen/AWS Terrain Tiles (SRTM, USGS 3DEP)"
json.dump(resort, open(f"{out}/resort.json", "w"), separators=(",", ":"))
print(f"surround {nx}x{ny} @ {CELL} m, z {z.min():.0f}..{z.max():.0f}, {(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles")
