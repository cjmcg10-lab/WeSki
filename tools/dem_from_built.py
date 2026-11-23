#!/usr/bin/env python3
"""Write the terrain of an already-built resort back out as a GeoTIFF that build_data.py accepts.

The original LiDAR tiles are large and are not kept. This lets a resort be rebuilt after a
change to the build or to its config without downloading them again: the grid comes out the same
as long as the resort's extent does not grow.

usage: dem_from_built.py <public/data/<id> dir> <out.tif> [epsg]
       epsg defaults to the projection the map was built in, found from the grid: its corner is a whole number
       of cells there and almost nowhere else (NAD83 / UTM for USGS tiles, Lambert 93 for IGN, LV95 for swisstopo,
       WGS 84 / UTM for GSI and the Austrian tiles, ...). Before 2026-11-23 it always assumed NAD83 / UTM, which
       is wrong outside North America (26900 + zone 32 is an Alabama state plane).
"""
import json
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

d, out = sys.argv[1], sys.argv[2]
R = json.load(open(f"{d}/resort.json"))
P, G = R["proj"], R["grid"]
nx, ny, cell = G["nx"], G["ny"], G["cell"]
h = np.fromfile(f"{d}/terrain.bin", dtype="<u2").reshape(ny, nx) / 10.0 + G["zmin"]


def lonlat(x, y):
    a, b = x - P["xm"], y - P["ym"]
    v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
    return P["lon0"] + sum(c * q for c, q in zip(P["clon"], v)), P["lat0"] + sum(c * q for c, q in zip(P["clat"], v))


# the grid origin is a whole number of cells in the projection, so rounding recovers it exactly
def corner(code):
    return Transformer.from_crs("EPSG:4326", code, always_xy=True).transform(*lonlat(0, 0))


def residual(code):
    try:
        e, n = corner(code)
    except Exception:
        return 1e9
    if not (abs(e) < 1e8 and abs(n) < 1e8):
        return 1e9
    return max(abs(e - round(e / cell) * cell), abs(n - round(n / cell) * cell))


if len(sys.argv) > 3:
    epsg = int(sys.argv[3])
else:
    zone = int((P["lon0"] + 180) // 6) + 1
    # a resort near a zone edge can have been built in the next zone (Telluride: USGS tiles in zone 12)
    zones = [zone, zone - 1, zone + 1]
    cands = ([26900 + z for z in zones if z <= 23] + [32600 + z for z in zones] + [25800 + z for z in zones]
             + [2154, 2056, 3035, 31287])
    res = sorted((residual(c), c) for c in cands)
    epsg = res[0][1]
    if res[0][0] > 0.5:
        raise SystemExit(f"cannot tell which projection the map was built in (best EPSG:{epsg}, {res[0][0]:.2f} m off): "
                         "pass the EPSG code as the third argument")
e, n = corner(epsg)
x0, y0 = round(e / cell) * cell, round(n / cell) * cell
print(f"origin {e:.2f},{n:.2f} -> {x0:.0f},{y0:.0f}  EPSG:{epsg}  {nx}x{ny} @ {cell} m")
with rasterio.open(out, "w", driver="GTiff", width=nx, height=ny, count=1, dtype="float32", crs=f"EPSG:{epsg}",
                   transform=from_origin(x0 - cell / 2, y0 + (ny - 0.5) * cell, cell, cell), nodata=-999999.0,
                   compress="deflate") as dst:
    dst.write(h[::-1].astype("float32"), 1)
