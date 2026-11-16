#!/usr/bin/env python3
"""Write the terrain of an already-built resort back out as a GeoTIFF that build_data.py accepts.

The original LiDAR tiles are large and are not kept. This lets a resort be rebuilt after a
change to the build or to its config without downloading them again: the grid comes out the same
as long as the resort's extent does not grow.

usage: dem_from_built.py <public/data/<id> dir> <out.tif> [epsg]
       epsg defaults to NAD83 / UTM for the resort's longitude (what the USGS tiles use)
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
epsg = int(sys.argv[3]) if len(sys.argv) > 3 else 26900 + int((P["lon0"] + 180) // 6) + 1
h = np.fromfile(f"{d}/terrain.bin", dtype="<u2").reshape(ny, nx) / 10.0 + G["zmin"]


def lonlat(x, y):
    a, b = x - P["xm"], y - P["ym"]
    v = [1, a, b, a * a, a * b, b * b, a ** 3, a * a * b, a * b * b, b ** 3]
    return P["lon0"] + sum(c * q for c, q in zip(P["clon"], v)), P["lat0"] + sum(c * q for c, q in zip(P["clat"], v))


# the grid origin is a whole number of cells in the projection, so rounding recovers it exactly
e, n = Transformer.from_crs("EPSG:4326", epsg, always_xy=True).transform(*lonlat(0, 0))
x0, y0 = round(e / cell) * cell, round(n / cell) * cell
print(f"origin {e:.2f},{n:.2f} -> {x0:.0f},{y0:.0f}  EPSG:{epsg}  {nx}x{ny} @ {cell} m")
with rasterio.open(out, "w", driver="GTiff", width=nx, height=ny, count=1, dtype="float32", crs=f"EPSG:{epsg}",
                   transform=from_origin(x0 - cell / 2, y0 + (ny - 0.5) * cell, cell, cell), nodata=-999999.0,
                   compress="deflate") as dst:
    dst.write(h[::-1].astype("float32"), 1)
