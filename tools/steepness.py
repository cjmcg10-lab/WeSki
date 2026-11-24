#!/usr/bin/env python3
"""Steepest pitch of each run, measured on the built terrain, and the steepness check on ratings (issue #45).

  python3 tools/steepness.py tune [<id> ...]   pitch of every officially rated run at our checked mountains, by
                                               rating: the numbers the thresholds below were set from

A run's pitch is its steepest 30 m stretch (height difference over 30 m along the line, in degrees), measured on
terrain.bin every 5 m. The check (applied by tools/build_zones.py) only touches runs whose rating comes from
OpenStreetMap alone (no resort list confirms it): a green steeper than RAISE[0] degrees is shown blue and a blue
steeper than RAISE[1] is shown black, flagged "raised" so the run card can say why. Tuned on 2026-11-23 so that no
run the resorts themselves rate would have been changed: on the 34 North American mountains the steepest official
green is 26.8 degrees (1,088 greens) and the steepest official blue 41.8 (2,065 blues). Applied to the North American
scheme only: Alpine greens and blues on the 14 m grid reach 38 degrees (La Plagne's Le Tunnel), so a threshold
there would catch nothing a person would not already see. It catches gross errors only (a blue on a 45 degree face); most
ratings that differ from the resort's own are narrow or exposed runs, not unusually steep ones.
"""
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAISE = {0: 28.0, 1: 43.0}   # green above 28 degrees -> blue; blue above 43 degrees -> black (see tune)
WINDOW, STEP = 30.0, 5.0


def heights(R, d):
    G = R["grid"]
    return np.fromfile(f"{d}/terrain.bin", dtype="<u2").reshape(G["ny"], G["nx"]) / 10.0 + G["zmin"]


def height_at(H, cell, x, y):
    ny, nx = H.shape
    fx, fy = min(max(x / cell, 0), nx - 1.001), min(max(y / cell, 0), ny - 1.001)
    i, j = int(fx), int(fy)
    u, v = fx - i, fy - j
    return (H[j, i] * (1 - u) * (1 - v) + H[j, i + 1] * u * (1 - v) + H[j + 1, i] * (1 - u) * v + H[j + 1, i + 1] * u * v)


def pitch(T, H, cell):
    """Steepest 30 m stretch of a run, in degrees (0 for runs shorter than 30 m)."""
    p = T["pts"]
    xy = [(p[i], p[i + 1]) for i in range(0, len(p) - 1, 2)]
    pts = [xy[0]]
    for (x1, y1), (x2, y2) in zip(xy, xy[1:]):
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) // STEP))
        pts += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(1, n + 1)]
    s, z = [0.0], [height_at(H, cell, *pts[0])]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        z.append(height_at(H, cell, *b))
    best, j = 0.0, 0
    for i in range(len(s)):
        while j < len(s) and s[j] - s[i] < WINDOW:
            j += 1
        if j >= len(s):
            break
        best = max(best, abs(z[j] - z[i]) / (s[j] - s[i]))
    return math.degrees(math.atan(best))


def tune(ids):
    names = ["green", "blue", "black", "double"]
    by = {k: [] for k in range(4)}
    for rid in ids:
        d = f"{ROOT}/public/data/{rid}"
        if not os.path.exists(f"{d}/resort.json") or not os.path.exists(f"{ROOT}/tools/official/{rid}.json"):
            continue
        R = json.load(open(f"{d}/resort.json"))
        H = heights(R, d)
        for T in R["trails"]:
            if T.get("ok") and not T.get("hide") and T.get("len", 0) >= 60 and not T.get("glade"):
                by[T["d"]].append((pitch(T, H, R["grid"]["cell"]), rid, T["name"]))
    for k in range(4):
        v = sorted(by[k])
        if not v:
            continue
        q = lambda f: v[min(len(v) - 1, int(f * len(v)))][0]
        print(f"{names[k]:7s} {len(v):5d} runs  median {q(0.5):4.1f}  90% {q(0.9):4.1f}  99% {q(0.99):4.1f}  "
              f"steepest {v[-1][0]:4.1f} ({v[-1][1]}: {v[-1][2]})" + (f"  above the threshold {RAISE[k]}: "
              + str(sum(x[0] > RAISE[k] for x in v)) if k in RAISE else ""))
        if k in RAISE:
            print("   steepest five:", "; ".join(f"{a:.1f} {b} {c}" for a, b, c in v[-5:]))


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "tune":
        ids = sys.argv[2:] or [r["id"] for r in json.load(open(f"{ROOT}/public/data/index.json"))]
        tune(ids)
    else:
        raise SystemExit(__doc__)
