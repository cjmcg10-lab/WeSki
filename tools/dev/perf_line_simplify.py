import json, math, sys
import numpy as np
for d in sys.argv[1:]:
    R = json.load(open(d + '/resort.json')); g = R['grid']; nx, ny, cell = g['nx'], g['ny'], g['cell']
    h = np.fromfile(d + '/terrain.bin', dtype='<u2').reshape(ny, nx) / 10.0

    def z(x, y):
        fx = min(max(x / cell, 0), nx - 1.001); fy = min(max(y / cell, 0), ny - 1.001); i = int(fx); j = int(fy); u = fx - i; v = fy - j
        za, zb, zd, ze = h[j, i], h[j, i + 1], h[j + 1, i], h[j + 1, i + 1]
        return za + u * (zb - za) + v * (ze - zb) if u >= v else za + u * (ze - zd) + v * (zd - za)

    def dp(p, lo, hi, exy, ez, keep):
        if hi - lo < 2: return
        a, b = p[lo], p[hi]; best = 0; bi = -1
        dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9
        for k in range(lo + 1, hi):
            t = max(0, min(1, ((p[k][0] - a[0]) * dx + (p[k][1] - a[1]) * dy) / L2))
            qx, qy = a[0] + t * dx, a[1] + t * dy; qz = a[2] + t * (b[2] - a[2])
            # plan error, and how far the straight line leaves the surface (at the dropped point and at its foot)
            e = max(math.hypot(p[k][0] - qx, p[k][1] - qy) / exy, abs(qz - z(qx, qy)) / ez, abs(qz - p[k][2]) / ez)
            if e > best: best, bi = e, k
        if best > 1:
            keep.add(bi); dp(p, lo, bi, exy, ez, keep); dp(p, bi, hi, exy, ez, keep)

    T = [t for t in R['trails'] if not t.get('hide')]
    res = {}
    for exy, ez in [(2, 1.5), (4, 2.5), (10, 6)]:
        n = 0
        for t in T:
            P = t['pts']; p = [(P[i], P[i + 1], z(P[i], P[i + 1])) for i in range(0, len(P), 2)]
            keep = {0, len(p) - 1}; dp(p, 0, len(p) - 1, exy, ez, keep); n += len(keep) - 1
        res[f'{exy}m/{ez}m'] = n
    print(d.split('/')[-1], 'segs', sum(len(t['pts']) // 2 - 1 for t in T), res)
