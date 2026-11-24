#!/usr/bin/env python3
"""Download a high-resolution elevation model for a resort outside the USA.

  swiss  swisstopo swissALTI3D, 2 m LiDAR grid (EPSG:2056)            data.geo.admin.ch
  ign    IGN France RGE ALTI, 1 m LiDAR / photogrammetry (EPSG:2154)  data.geopf.fr
  gsi    GSI Japan 5 m LiDAR DEM tiles, 10 m where 5 m is missing     cyberjapandata.gsi.go.jp
         (written in the local UTM zone)
  cog    any cloud-optimised GeoTIFF read over HTTP, reprojected to the EPSG code given:
           Austria  BEV ALS DTM 1 m (CC BY 4.0)   data.bev.gv.at/download/ALS/DTM/<date>/ALS_DTM_CRS3035RES50000mN<N>E<E>.tif
           Canada   NRCan HRDEM 1 m (OGL-Canada)  canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/<project>-1m-dtm.tif
         usage: fetch_dem.py cog <out.tif> <west> <south> <east> <north> <epsg> <url> [<url> ...]
  canada NRCan HRDEM mosaic 1 m (lidar, OGL-Canada), tiles found from their published extents; MRDEM 30 m fills
         what the 1 m mosaic does not cover (canelevation-dem.s3.ca-central-1.amazonaws.com)
  copernicus  Copernicus DEM GLO-30, 30 m, worldwide (copernicus-dem-30m.s3.amazonaws.com; free, credit
         "produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH
         2014-2018 provided under COPERNICUS by the European Union and ESA"). A surface model (tree tops and roofs,
         not bare earth): the fallback where no national lidar can be read automatically.

The cog, canada and copernicus sources print "share <source> <percent>" lines: how much of the area each source
filled (tools/pipeline.py reads them so the card and the quality gate know the terrain's resolution).

usage: fetch_dem.py <swiss|ign|gsi> <out.tif> <west> <south> <east> <north>   (degrees; pad ~700 m around the resort)
"""
import io
import json
import math
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject
from pyproj import Transformer

NODATA = -999999.0


def get(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "weski-build"})
            return urllib.request.urlopen(req, timeout=180).read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    raise SystemExit(f"failed: {url}")


def write(path, arr, transform, crs):
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                       crs=crs, transform=transform, nodata=NODATA, compress="deflate", tiled=True) as dst:
        dst.write(arr.astype("float32"), 1)
    print(f"{path}: {arr.shape[1]}x{arr.shape[0]}, z {arr[arr > -9000].min():.0f}..{arr.max():.0f}, holes {(arr < -9000).mean() * 100:.2f}%")


def source_name(url):
    """A short label for a terrain url, for the share lines (USGS: 1 m surveys vs the 10 m national model)."""
    u = url.lower()
    if "/elevation/1m/" in u or "1m-dtm" in u:
        return "1m"
    if "/elevation/13/" in u:
        return "10m"
    return "other"


def cog(out, w, s, e, n, epsg, urls, res=2.0, names=None):
    """Window of one or more remote COGs, warped to a metric projection at `res` metres. Each url fills only the
    holes left by the ones before it, so the best source comes first. `names` labels each url in the share lines."""
    import os
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import from_bounds
    os.environ.setdefault("CURL_CA_BUNDLE", os.environ.get("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt"))
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
    crs = f"EPSG:{epsg}"
    tf = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    xs, ys = zip(*[tf.transform(lon, lat) for lon in (w, e) for lat in (s, n)])
    x0, x1, y0, y1 = math.floor(min(xs) / res) * res, math.ceil(max(xs) / res) * res, math.floor(min(ys) / res) * res, math.ceil(max(ys) / res) * res
    W, H = int((x1 - x0) / res), int((y1 - y0) / res)
    arr = np.full((H, W), NODATA, dtype="float32")
    tr = from_origin(x0, y1, res, res)
    filled = {}
    for url in urls:
        before = int((arr < -9000).sum())
        if not before:
            break
        try:
            opened = rasterio.open("/vsicurl/" + url)
        except Exception as ex:   # a tile that does not exist (open sea, outside a survey) leaves its holes
            print(f"  {url.rsplit('/', 1)[-1]}: not readable ({str(ex)[:80]})", flush=True)
            continue
        with opened as src:
            with WarpedVRT(src, crs=crs, transform=tr, width=W, height=H, resampling=Resampling.bilinear, nodata=NODATA) as vrt:
                step = 1024   # read in strips so one failed range request does not lose everything
                for r0 in range(0, H, step):
                    part = vrt.read(1, window=((r0, min(H, r0 + step)), (0, W)))
                    dst = arr[r0:r0 + part.shape[0]]
                    m = (dst < -9000) & (part > -9000) & (part < 9000)
                    dst[m] = part[m]
        print(f"  {url.rsplit('/', 1)[-1]}: holes now {(arr < -9000).mean() * 100:.2f}%", flush=True)
        name = (names or {}).get(url) or source_name(url)
        filled[name] = filled.get(name, 0) + before - int((arr < -9000).sum())
    for name, v in filled.items():
        print(f"share {name} {v / arr.size * 100:.1f}")
    write(out, arr, tr, crs)


def utm_epsg(w, s, e, n, nad83=False):
    lon, lat = (w + e) / 2, (s + n) / 2
    zone = int((lon + 180) // 6) + 1
    return (26900 if nad83 else (32600 if lat >= 0 else 32700)) + zone


HRDEM = "https://canelevation-dem.s3.ca-central-1.amazonaws.com"


def hrdem_extents(prefix):
    """{dtm url path: [w, s, e, n]} for every HRDEM file under a prefix, from the extent files NRCan publishes
    beside each one (listed once and cached in $PIPE_WORK: about 60 mosaic tiles and 950 lidar projects)."""
    import os
    import re
    from concurrent.futures import ThreadPoolExecutor
    cache = os.path.join(os.environ.get("PIPE_WORK", "/tmp/weski-pipe"), f"hrdem-extents-{prefix.strip('/')}.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    keys, tok = [], None
    while True:
        q = f"{HRDEM}/?list-type=2&prefix={prefix}&max-keys=1000" + (
            "&continuation-token=" + urllib.parse.quote(tok, safe="") if tok else "")
        x = get(q).decode()
        keys += re.findall(r"<Key>([^<]*-extent\.geojson)</Key>", x)
        m = re.search(r"<NextContinuationToken>([^<]*)", x)
        if not m:
            break
        tok = m.group(1)

    def box(k):
        raw = get(f"{HRDEM}/{k}")
        if not raw:
            return k, None
        pts = []
        g = json.loads(raw)
        for f in g.get("features") or ([g] if g.get("type") == "Feature" else [{"geometry": g}]):
            if not f.get("geometry") or f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
                continue
            c = f["geometry"]["coordinates"]
            for ring in (c if f["geometry"]["type"] == "Polygon" else [r for poly in c for r in poly]):
                pts += ring
        return k, [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)] if pts else None
    with ThreadPoolExecutor(16) as ex:
        ext = {k.replace("-extent.geojson", "-dtm.tif"): b for k, b in ex.map(box, keys) if b}
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    json.dump(ext, open(cache, "w"))
    return ext


def canada(out, w, s, e, n):
    """HRDEM 1 m mosaic tiles, then the single lidar projects (newest first), whose published extent overlaps the
    box; MRDEM 30 m (a national bare-earth model) fills the rest. The mosaic has gaps where the projects do not
    (measured on Sun Peaks, 2026-11-23: no mosaic coverage)."""
    import re
    hit = lambda b: b[0] < e and b[2] > w and b[1] < n and b[3] > s
    mosaic = [f"{HRDEM}/{k}" for k, b in sorted(hrdem_extents("hrdem-mosaic-1m/").items()) if hit(b)]
    year = lambda k: max([int(y) for y in re.findall(r"(20\d\d|19\d\d)", k)] or [0])
    proj = sorted((k for k, b in hrdem_extents("hrdem-lidar/").items() if hit(b)), key=lambda k: -year(k))
    tiles = mosaic + [f"{HRDEM}/{k}" for k in proj]
    coarse = f"{HRDEM}/mrdem-30/mrdem-30-dtm.tif"
    names = {**{u: "1m" for u in tiles}, coarse: "30m"}
    print(f"{len(mosaic)} HRDEM 1 m mosaic tiles and {len(proj)} lidar projects overlap the area")
    cog(out, w, s, e, n, utm_epsg(w, s, e, n, nad83=True), tiles + [coarse], names=names)


def copernicus(out, w, s, e, n):
    """Copernicus GLO-30 one-degree tiles over the box (30 m), warped to UTM at 10 m."""
    urls = []
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns, ew = ("N" if lat >= 0 else "S") + f"{abs(lat):02d}", ("E" if lon >= 0 else "W") + f"{abs(lon):03d}"
            t = f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM"
            urls.append(f"https://copernicus-dem-30m.s3.amazonaws.com/{t}/{t}.tif")
    cog(out, w, s, e, n, utm_epsg(w, s, e, n), urls, res=10.0, names={u: "30m" for u in urls})


def swiss(out, w, s, e, n):
    url = f"https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items?bbox={w},{s},{e},{n}&limit=100"
    best = {}   # tile id -> (year, href)
    while url:
        d = json.loads(get(url))
        for f in d["features"]:
            for name, a in f["assets"].items():
                if name.endswith("_2_2056_5728.tif"):
                    _, year, tile = name.split("_")[:3]
                    if tile not in best or year > best[tile][0]:
                        best[tile] = (year, a["href"])
        url = next((l["href"] for l in d.get("links", []) if l["rel"] == "next"), None)
    print(f"{len(best)} swissALTI3D tiles")
    mems = [MemoryFile(get(href)) for _, href in best.values()]
    srcs = [m.open() for m in mems]
    arr, tr = merge(srcs, nodata=NODATA)
    write(out, arr[0], tr, "EPSG:2056")


def ign(out, w, s, e, n, res=2.0, chunk=2000):
    tf = Transformer.from_crs("EPSG:4326", "EPSG:2154", always_xy=True)
    xs, ys = zip(*(tf.transform(lon, lat) for lon in (w, e) for lat in (s, n)))
    x0, y0 = math.floor(min(xs) / res) * res, math.floor(min(ys) / res) * res
    nx, ny = int(math.ceil((max(xs) - x0) / res)), int(math.ceil((max(ys) - y0) / res))
    full = np.full((ny, nx), NODATA, dtype="float32")
    for j in range(0, ny, chunk):
        for i in range(0, nx, chunk):
            cw, ch = min(chunk, nx - i), min(chunk, ny - j)
            bx0, by0 = x0 + i * res, y0 + j * res
            data = get("https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&STYLES=&FORMAT=image/geotiff"
                       "&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&CRS=EPSG:2154"
                       f"&BBOX={bx0},{by0},{bx0 + cw * res},{by0 + ch * res}&WIDTH={cw}&HEIGHT={ch}")
            with MemoryFile(data) as m, m.open() as src:
                a = src.read(1)
            a[a < -9000] = NODATA
            full[ny - j - ch:ny - j, i:i + cw] = a   # rows run north to south
    write(out, full, from_origin(x0, y0 + ny * res, res, res), "EPSG:2154")


def gsi(out, w, s, e, n):
    from PIL import Image
    Z = 15
    N = 2 ** Z

    def tile(lat, lon):
        return (lon + 180) / 360 * N, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N

    tx0, ty0 = (int(v) for v in tile(n, w))
    tx1, ty1 = (int(v) for v in tile(s, e))
    mos = np.full(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), NODATA, dtype="float32")
    used = {"5m": 0, "10m": 0}

    def decode(png):
        p = np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(np.int64)
        v = p[..., 0] * 65536 + p[..., 1] * 256 + p[..., 2]
        h = np.where(v < 2 ** 23, v, v - 2 ** 24) * 0.01
        return np.where(v == 2 ** 23, NODATA, h).astype("float32")

    low = {}   # zoom-14 10 m tiles, fetched on demand
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            h = np.full((256, 256), NODATA, dtype="float32")
            for layer in ("dem5a_png", "dem5b_png", "dem5c_png"):
                png = get(f"https://cyberjapandata.gsi.go.jp/xyz/{layer}/{Z}/{tx}/{ty}.png")
                if png:
                    d = decode(png)
                    h = np.where(h < -9000, d, h)
                if (h > -9000).all():
                    break
            used["5m"] += int((h > -9000).sum())
            if (h < -9000).any():
                key = (tx // 2, ty // 2)
                if key not in low:
                    png = get(f"https://cyberjapandata.gsi.go.jp/xyz/dem_png/{Z - 1}/{key[0]}/{key[1]}.png")
                    low[key] = decode(png) if png else np.full((256, 256), NODATA, dtype="float32")
                q = low[key][(ty % 2) * 128:(ty % 2) * 128 + 128, (tx % 2) * 128:(tx % 2) * 128 + 128]
                up = np.kron(q, np.ones((2, 2), dtype="float32"))
                used["10m"] += int(((h < -9000) & (up > -9000)).sum())
                h = np.where(h < -9000, up, h)
            mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = h
    tot = used["5m"] + used["10m"] or 1
    print(f"GSI tiles: {used['5m'] / tot * 100:.0f}% 5 m, {used['10m'] / tot * 100:.0f}% 10 m")
    R = 20037508.342789244
    px = 2 * R / (N * 256)
    src_tr = from_origin(-R + tx0 * 256 * px, R - ty0 * 256 * px, px, px)
    zone = int((w + e) / 2 // 6) + 31
    dst_crs = f"EPSG:{32600 + zone}"
    bounds = (-R + tx0 * 256 * px, R - (ty1 + 1) * 256 * px, -R + (tx1 + 1) * 256 * px, R - ty0 * 256 * px)
    tr, wd, ht = calculate_default_transform("EPSG:3857", dst_crs, mos.shape[1], mos.shape[0], *bounds, resolution=5.0)
    dst = np.full((ht, wd), NODATA, dtype="float32")
    reproject(mos, dst, src_transform=src_tr, src_crs="EPSG:3857", dst_transform=tr, dst_crs=dst_crs,
              src_nodata=NODATA, dst_nodata=NODATA, resampling=Resampling.bilinear)
    write(out, dst, tr, dst_crs)


if __name__ == "__main__":
    if sys.argv[1] == "cog":
        cog(sys.argv[2], *map(float, sys.argv[3:7]), int(sys.argv[7]), sys.argv[8:])
    else:
        {"swiss": swiss, "ign": ign, "gsi": gsi, "canada": canada, "copernicus": copernicus}[sys.argv[1]](sys.argv[2], *map(float, sys.argv[3:7]))
