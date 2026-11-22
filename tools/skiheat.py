"""The app's anonymous ski counts (GET /api/heat/<id>), for tools/evidence.py. Pure helpers, tested in test_reports.py.

The server publishes {"days": ski days received, "k": 5, "cell": 20, "runs": {run number: ski days},
"cells": {"cx,cy": ski days}}, where a run or a 20 m square appears only once at least k different ski days reached
it. Run numbers are the "id" of runs in resort.json; squares are 20 m cells of that resort's map metres
(x // 20, y // 20), counted only where the skier was off every mapped run and going downhill.
"""
from reports import dist_to_line, map_to_lonlat, osm_link, _pts


def empty_heat():
    return {"days": 0, "k": 5, "cell": 20, "runs": {}, "cells": {}}


def clean_heat(h):
    """Whatever the server sent -> a heat dict with the expected keys (empty when missing or malformed)."""
    if not isinstance(h, dict):
        return empty_heat()
    out = empty_heat()
    out["days"] = int(h.get("days") or 0)
    out["k"] = int(h.get("k") or 5)
    out["cell"] = float(h.get("cell") or 20)
    for key in ("runs", "cells"):
        v = h.get(key)
        if isinstance(v, dict):
            out[key] = {str(a): int(b) for a, b in v.items() if isinstance(b, (int, float))}
    return out


def clusters(cells, size=20.0, min_cells=3):
    """Join touching squares (also corner to corner) -> list of {cells, days (most in one square), sum, x, y},
    biggest first; groups with fewer than min_cells squares are left out (one skier's day off-piste looks like that)."""
    pts = {}
    for k, n in cells.items():
        try:
            a, b = k.split(",")
            pts[(int(a), int(b))] = n
        except ValueError:
            continue
    seen, out = set(), []
    for start in pts:
        if start in seen:
            continue
        seen.add(start)
        stack, group = [start], []
        while stack:
            c = stack.pop()
            group.append(c)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (c[0] + dx, c[1] + dy)
                    if q in pts and q not in seen:
                        seen.add(q)
                        stack.append(q)
        if len(group) < min_cells:
            continue
        w = sum(pts[c] for c in group)
        x = sum((c[0] + 0.5) * size * pts[c] for c in group) / w
        y = sum((c[1] + 0.5) * size * pts[c] for c in group) / w
        out.append({"cells": len(group), "days": max(pts[c] for c in group), "sum": w, "x": round(x, 1), "y": round(y, 1)})
    out.sort(key=lambda g: (-g["cells"], -g["sum"]))
    return out


def describe_clusters(groups, resort, limit=30):
    """Add the nearest shown run, its distance and an OpenStreetMap link to each group."""
    shown = [t for t in resort.get("trails") or [] if not t.get("hide")]
    lines = [(t, _pts(t)) for t in shown]
    out = []
    for g in groups[:limit]:
        p = (g["x"], g["y"])
        best = min(((dist_to_line(p, ln), t) for t, ln in lines if ln), key=lambda v: v[0], default=None)
        lon, lat = map_to_lonlat(resort["proj"], g["x"], g["y"])
        out.append(dict(g, near=(best[1].get("name") or "(no name)") if best else None,
                        near_m=round(best[0]) if best else None, lon=round(lon, 6), lat=round(lat, 6), link=osm_link(lon, lat)))
    return out


def run_counts(heat, resort):
    """{osm way id (str) or "n<run number>": ski days} for runs in resort.json."""
    out = {}
    for t in resort.get("trails") or []:
        n = heat["runs"].get(str(t.get("id")))
        if n:
            out[str(t["osm"]) if t.get("osm") is not None else f"n{t['id']}"] = n
    return out
