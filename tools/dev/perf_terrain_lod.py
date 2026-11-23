"""Terrain level of detail estimate: split the grid into chunks of C cells, and for each chunk measure the worst
vertical error of drawing it with every 2nd / 4th / 8th vertex (bilinear between kept vertices). Then, for the
three bench views, count triangles drawn with (a) frustum culling only and (b) culling + error-driven LOD at a
1.5 px budget, for a 390x844 CSS-pixel phone screen, fov 42."""
import json, math, sys
import numpy as np

C = 32
for d in sys.argv[1:]:
    R = json.load(open(d + '/resort.json')); g = R['grid']; nx, ny, cell = g['nx'], g['ny'], g['cell']
    h = np.fromfile(d + '/terrain.bin', dtype='<u2').reshape(ny, nx).astype(np.float64) / 10.0
    W, H = (nx - 1) * cell, (ny - 1) * cell
    cx, cy = math.ceil((nx - 1) / C), math.ceil((ny - 1) / C)
    chunks = []
    for bj in range(cy):
        for bi in range(cx):
            i0, j0 = bi * C, bj * C; i1, j1 = min(nx - 1, i0 + C), min(ny - 1, j0 + C)
            blk = h[j0:j1 + 1, i0:i1 + 1]
            errs = []
            for s in (2, 4, 8):
                # coarse grid: every s-th vertex (and the edge), bilinear back up
                xs = list(range(0, blk.shape[1], s)); ys = list(range(0, blk.shape[0], s))
                if xs[-1] != blk.shape[1] - 1: xs.append(blk.shape[1] - 1)
                if ys[-1] != blk.shape[0] - 1: ys.append(blk.shape[0] - 1)
                co = blk[np.ix_(ys, xs)]
                xi = np.interp(np.arange(blk.shape[1]), xs, np.arange(len(xs)))
                yi = np.interp(np.arange(blk.shape[0]), ys, np.arange(len(ys)))
                X0 = np.floor(xi).astype(int).clip(0, len(xs) - 2); Y0 = np.floor(yi).astype(int).clip(0, len(ys) - 2)
                fx = xi - X0; fy = yi - Y0
                a = co[np.ix_(Y0, X0)]; b = co[np.ix_(Y0, X0 + 1)]; c = co[np.ix_(Y0 + 1, X0)]; e = co[np.ix_(Y0 + 1, X0 + 1)]
                FX, FY = np.meshgrid(fx, fy)
                approx = a * (1 - FX) * (1 - FY) + b * FX * (1 - FY) + c * (1 - FX) * FY + e * FX * FY
                errs.append(float(np.abs(approx - blk).max()))
            ncell = (i1 - i0) * (j1 - j0)
            chunks.append(dict(x=(i0 + i1) / 2 * cell - W / 2, z=-((j0 + j1) / 2 * cell - H / 2), y=float(blk.mean()) - g['zmin'] * 0 - 0,
                               zr=float(blk.max() - blk.min()), r=math.hypot(i1 - i0, j1 - j0) * cell / 2, tris=2 * ncell, errs=errs))
    full = sum(c['tris'] for c in chunks)
    e = np.array([c['errs'] for c in chunks])
    print(d.split('/')[-1], f'chunks {len(chunks)} full tris {full}  median err x2 {np.median(e[:,0]):.1f} m  x4 {np.median(e[:,1]):.1f} m  x8 {np.median(e[:,2]):.1f} m; 90th pct x2 {np.percentile(e[:,0],90):.1f} x4 {np.percentile(e[:,1],90):.1f}')
    # camera distance bands: tris if every chunk at distance D picks the coarsest level with error < 1.5 px
    pxm = lambda D: D * 2 * math.tan(math.radians(21)) / 844   # metres per CSS pixel at distance D
    for D in (700, 2000, 5000, 10000):
        t = 0
        for c in chunks:
            # distance from a camera D away from the chunk (rough: same D for all, tells the per-band saving)
            lvl = 0
            for k in range(3):
                if c['errs'][k] < 1.5 * pxm(D): lvl = k + 1
            t += c['tris'] / (4 ** lvl)
        print(f'   all chunks seen from {D} m: {t/full*100:.0f}% of the triangles')
